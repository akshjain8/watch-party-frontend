import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, SkipBack, SkipForward, Users } from 'lucide-react';
import { toast } from 'sonner';

// Configuration
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const DEBUG = process.env.NODE_ENV === 'development';

// Conditional logging helper
const log = (...args) => DEBUG && console.log(...args);
const logError = (...args) => console.error(...args); // Always log errors

const WatchParty = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Socket and Connection
  const [socket, setSocket] = useState(null);
  const [userCount, setUserCount] = useState(0);
  
  // Video State
  const [videoUrl, setVideoUrl] = useState('');
  const [currentVideoId, setCurrentVideoId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // UI State
  const [playerReadyUI, setPlayerReadyUI] = useState(false); // Triggers UI re-render when player ready
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false); // Shows "Click to Sync" banner
  
  // YouTube API State
  const [isYouTubeAPIReady, setIsYouTubeAPIReady] = useState(false);
  
  // ============================================================================
  // REFS (Don't trigger re-renders, avoid stale closures in event handlers)
  // ============================================================================
  
  // YouTube Player
  const YT = useRef(null); // YouTube IFrame API reference
  const playerRef = useRef(null); // YouTube player instance
  const isPlayerReady = useRef(false); // Player initialization status (ref to avoid stale closures)
  
  // Synchronization State
  const latestSessionState = useRef(null); // Stores session state when player not ready
  const lastVersionRef = useRef(0); // Tracks version to ignore stale updates
  
  // Flags to Prevent Event Loops
  const isLocalAction = useRef(false); // Marks user's own actions (prevent echo)
  const applyingServerUpdate = useRef(false); // Marks server update in progress
  const isRequestingSync = useRef(false); // Marks manual sync request from "Click to Sync"
  const hasInteracted = useRef(false); // Tracks if user clicked anything (for autoplay policy)

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  /**
   * Computes the actual playback time accounting for network delay
   * 
   * Server sends:
   *   - playbackTimeAtLastEvent: Time when event occurred (e.g., 10.0s)
   *   - lastEventAt: Server timestamp when event occurred (e.g., T0)
   *   - serverTime: Current server time when snapshot created (e.g., T0 + 200ms)
   * 
   * If playing, we add elapsed time to get current position:
   *   targetTime = 10.0 + (200ms / 1000) = 10.2s
   * 
   * This accounts for network delay and keeps all clients in perfect sync
   */
  const computeTargetTime = (snapshot) => {
    if (!snapshot.isPlaying) {
      return snapshot.playbackTimeAtLastEvent; // Paused = time is frozen
    }
    
    // Calculate elapsed time since last state change
    const elapsedMs = snapshot.serverTime - snapshot.lastEventAt;
    return snapshot.playbackTimeAtLastEvent + (elapsedMs / 1000);
  };

  /**
   * Applies a session snapshot to the YouTube player with drift correction
   * 
   * Drift correction prevents jittery seeking:
   *   - If drift < 350ms: Ignore (imperceptible to user)
   *   - If drift > 350ms: Seek to correct position
   * 
   * This balances sync accuracy with smooth playback
   */
  const applySnapshot = (snapshot) => {
    // If player not ready yet, store for later
    if (!playerRef.current || !isPlayerReady.current) {
      log('Player not ready, storing snapshot for later');
      latestSessionState.current = snapshot;
      return;
    }
    
    // Mark that we're applying a server update (prevents event loops)
    applyingServerUpdate.current = true;
    
    // Calculate target time accounting for network delay
    const targetTime = computeTargetTime(snapshot);
    const currentTime = playerRef.current.getCurrentTime();
    const drift = Math.abs(targetTime - currentTime);
  
    
    // Only seek if drift exceeds threshold (reduces jitter)
    if (drift > 0.35) {
      log(`Drift ${drift.toFixed(2)}s detected, seeking to ${targetTime.toFixed(2)}s`);
      playerRef.current.seekTo(targetTime, true);
    }
    
    // Apply play/pause state
    if (snapshot.isPlaying) {
      playerRef.current.playVideo();
      setIsPlaying(true);
    } else {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
    
    // Reset flag after short delay (allows YouTube API to process)
    setTimeout(() => {
      applyingServerUpdate.current = false;
    }, 200);
  };

  // ============================================================================
  // INITIALIZATION: Load YouTube IFrame API
  // ============================================================================
  
  /**
   * STEP 1: Load YouTube IFrame API FIRST (before socket connection)
   * 
   * Why this order?
   *   - YouTube API must be ready before we can initialize players
   *   - Socket connection happens AFTER API is ready
   *   - Prevents race conditions where session state arrives before player can be created
   * 
   * The YouTube API loads asynchronously and calls onYouTubeIframeAPIReady when ready
   */
  useEffect(() => {
    if (!window.YT) {
      // Load YouTube IFrame API script
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      // Global callback when YouTube API is ready
      window.onYouTubeIframeAPIReady = () => {
        log('YouTube IFrame API loaded and ready');
        YT.current = window.YT;
        setIsYouTubeAPIReady(true); // Triggers socket connection
      };
    } else {
      // YouTube API already loaded (hot reload in development)
      YT.current = window.YT;
      setIsYouTubeAPIReady(true);
    }
  }, []);

  // ============================================================================
  // SOCKET CONNECTION: Establish real-time sync with backend
  // ============================================================================
  
  /**
   * STEP 2: Initialize Socket.io connection AFTER YouTube API is ready
   * 
   * This dependency on isYouTubeAPIReady ensures sequential initialization:
   *   1. YouTube API loads
   *   2. Socket connects
   *   3. Player can be initialized immediately when video ID received
   * 
   * Socket.io Configuration:
   *   - Custom path: /api/socket.io (matches backend routing)
   *   - Transports: WebSocket (preferred) with polling fallback
   *   - Auto-reconnection: Up to 5 attempts with exponential backoff
   */
  useEffect(() => {
    if (!isYouTubeAPIReady) {
      return; // Wait for YouTube API before connecting socket
    }

    log('Establishing socket connection to', BACKEND_URL);
    
    const newSocket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000
    });

    // Connection successful
    newSocket.on('connect', () => {
      log('Connected to server:', newSocket.id);
      toast.success('Connected to watch party!');
    });

    // Connection failed
    newSocket.on('connect_error', (error) => {
      logError('Socket connection error:', error.message);
      toast.error('Failed to connect to server. Retrying...');
    });

    // Disconnected from server
    newSocket.on('disconnect', (reason) => {
      log('Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - manually reconnect
        newSocket.connect();
      } else {
        toast.error('Disconnected from server');
      }
    });

    /**
     * UNIFIED SESSION STATE LISTENER
     * 
     * Replaces individual play/pause/seek listeners with one consolidated event.
     * Server broadcasts full state snapshots with version control and drift compensation.
     * 
     * Key Features:
     *   1. Version Control: Ignores out-of-order/stale updates
     *   2. Drift Compensation: Calculates current time accounting for network delay
     *   3. Autoplay Policy: Shows "Click to Sync" banner when needed
     *   4. Echo Prevention: Filters own actions via isLocalAction flag
     */
    newSocket.on('session:state', (snapshot) => {
      log('Received session:state:', {
        version: snapshot.version,
        videoId: snapshot.videoId,
        isPlaying: snapshot.isPlaying,
        targetTime: snapshot.playbackTimeAtLastEvent ? computeTargetTime(snapshot).toFixed(2) : 'N/A'
      });
      
      // ========== VERSION CONTROL ==========
      // Ignore stale/out-of-order snapshots (network can reorder packets)
      if (snapshot.version <= lastVersionRef.current) {
        log(`Ignoring stale snapshot v${snapshot.version} (current: v${lastVersionRef.current})`);
        return;
      }
      lastVersionRef.current = snapshot.version;
      
      // ========== VIDEO CHANGE HANDLING ==========
      if (snapshot.videoId && snapshot.videoId !== currentVideoId) {
        log('Video changed to:', snapshot.videoId);
        setCurrentVideoId(snapshot.videoId); // Triggers player initialization
        // toast.info('Video changed!');
        
        // If video already playing for others, show sync banner
        if (snapshot.isPlaying && !hasInteracted.current) {
          setNeedsUserInteraction(true);
        }
      }
      
      // ========== PLAYER READY CHECK ==========
      // If player not initialized yet, store snapshot for later
      if (!isPlayerReady.current) {
        log('Player not ready, storing snapshot');
        latestSessionState.current = snapshot;
        return;
      }
      
      // ========== APPLY SNAPSHOT LOGIC ==========
      // Three cases:
      
      // Case 1: User clicked "Click to Sync" button
      if (isRequestingSync.current && playerRef.current && isPlayerReady.current) {
        log('Applying explicitly requested sync');
        applySnapshot(snapshot);
        isRequestingSync.current = false;
      }
      
      // Case 2: Video playing but user hasn't interacted (browser autoplay policy)
      else if (snapshot.isPlaying && !hasInteracted.current) {
        log('Video playing, waiting for user interaction');
        setNeedsUserInteraction(true); // Show "Click to Sync" banner
        latestSessionState.current = snapshot;
      }
      
      // Case 3: Normal sync (most common case)
      else if (playerRef.current && isPlayerReady.current && !applyingServerUpdate.current && !isLocalAction.current) {
        log('Applying snapshot with drift correction');
        applySnapshot(snapshot);
      }
      
      // Case 4: Conditions not met (debugging)
      else {
        log('Snapshot not applied, conditions:', {
          hasPlayer: !!playerRef.current,
          isReady: isPlayerReady.current,
          applyingUpdate: applyingServerUpdate.current,
          isLocal: isLocalAction.current
        });
      }
    });

    newSocket.on('user-count', (count) => {
      setUserCount(count);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [isYouTubeAPIReady]); // Dependency: only connect when YouTube API is ready

  // ============================================================================
  // YOUTUBE PLAYER INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize YouTube player when video ID changes
   * 
   * Player lifecycle:
   *   1. Video ID changes → Reset player ready state
   *   2. Destroy old player (if exists)
   *   3. Create new player with video ID
   *   4. Wait for onReady callback
   *   5. Apply any stored session state
   * 
   * Player Configuration:
   *   - controls: 0       → Disable native controls (prevents desync)
   *   - disablekb: 1      → Disable keyboard shortcuts
   *   - autoplay: 0       → Don't autoplay (handle via session state)
   */
  useEffect(() => {
    if (!currentVideoId || !YT.current) {
      return; // Wait for video ID and YouTube API
    }

    log('Initializing YouTube player for:', currentVideoId);
    
    // Reset ready state for new video
    isPlayerReady.current = false;
    setPlayerReadyUI(false);

    const initPlayer = () => {
      // Verify player div exists in DOM
      const playerDiv = document.getElementById('youtube-player');
      if (!playerDiv) {
        logError('Player div not found! Retrying...');
        setTimeout(initPlayer, 500);
        return;
      }

      // Destroy existing player if present
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          logError('Error destroying old player:', e);
        }
      }

      // Create new YouTube player
      try {
        playerRef.current = new YT.current.Player('youtube-player', {
          height: '100%',
          width: '100%',
          videoId: currentVideoId,
          playerVars: {
            autoplay: 0,
            controls: 0,          // Disable native controls
            disablekb: 1,         // Disable keyboard
            modestbranding: 1,    // Minimal YouTube branding
            rel: 0                // No related videos
          },
          events: {
            onReady: (event) => {
              log('YouTube player ready');
              isPlayerReady.current = true;
              setPlayerReadyUI(true);
              
              // Apply any queued session state
              if (latestSessionState.current) {
                log('Applying queued session state');
                applySnapshot(latestSessionState.current);
                latestSessionState.current = null;
              }
            },
            onStateChange: onPlayerStateChange,
            onError: (event) => {
              logError('YouTube player error:', event.data);
              toast.error('Video failed to load');
            }
          }
        });
      } catch (error) {
        logError('Failed to create player:', error);
        toast.error('Failed to initialize video player');
      }
    };

    const timer = setTimeout(initPlayer, 100);
    return () => clearTimeout(timer);
  }, [currentVideoId]);

  /**
   * YouTube player state change handler
   * Used primarily for UI updates (play/pause/buffering state)
   */
  const onPlayerStateChange = (event) => {
    // State codes: UNSTARTED (-1), ENDED (0), PLAYING (1), PAUSED (2), BUFFERING (3), CUED (5)
    if (event.data === 1) {
      setIsPlaying(true);
    } else if (event.data === 2) {
      setIsPlaying(false);
    } else if (event.data === 3) {
      setIsLoading(true);
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle video URL submission
   * Extracts video ID server-side and broadcasts to all clients
   */
  const handleVideoSubmit = (e) => {
    e.preventDefault();
    
    if (!socket || !socket.connected) {
      toast.error('Not connected to server. Please wait...');
      return;
    }
    
    if (videoUrl) {
      const currentTime = playerRef.current?.getCurrentTime?.() || 0;
      socket.emit('change-video', {
        url: videoUrl,
        currentTime,
        isPlaying: !!isPlaying
      });
      setVideoUrl('');
    }
  };

  /**
   * Handle play button click
   * 
   * Flow:
   *   1. Mark as local action (prevents echo)
   *   2. Play locally (instant feedback)
   *   3. Emit to server
   *   4. Server broadcasts to others
   */
  const handlePlay = () => {
    if (!playerRef.current || !socket || !socket.connected) return;
    
    isLocalAction.current = true;
    hasInteracted.current = true; // Required for autoplay policy
    setNeedsUserInteraction(false);
    
    const currentTime = playerRef.current.getCurrentTime();
    playerRef.current.playVideo(); // Apply locally first
    socket.emit('play', { currentTime });
    setIsPlaying(true);
    
    setTimeout(() => isLocalAction.current = false, 100);
  };

  /**
   * Handle "Click to Sync" button
   * Requests latest session state and applies it (doesn't broadcast own state)
   */
  const handleSyncToSession = () => {
    hasInteracted.current = true;
    setNeedsUserInteraction(false);
    isRequestingSync.current = true;
    
    // Request fresh state from server
    if (socket && socket.connected) {
      socket.emit('request-session-state');
    }
    
    // If we have cached state and player is ready, apply immediately
    if (latestSessionState.current && playerRef.current && isPlayerReady.current) {
      log('Applying cached session state');
      applySnapshot(latestSessionState.current);
      isRequestingSync.current = false;
    }
  };

  /**
   * Handle pause button click
   * Same pattern as play: apply locally → emit → broadcast
   */
  const handlePause = () => {
    if (!playerRef.current || !socket || !socket.connected) return;
    
    isLocalAction.current = true;
    const currentTime = playerRef.current.getCurrentTime();
    playerRef.current.pauseVideo();
    socket.emit('pause', { currentTime });
    setIsPlaying(false);
    
    setTimeout(() => isLocalAction.current = false, 100);
  };

  /**
   * Handle seek forward/backward
   * @param {number} seconds - Seconds to seek (positive = forward, negative = backward)
   */
  const handleSeek = (seconds) => {
    if (!playerRef.current || !socket || !socket.connected) return;
    
    isLocalAction.current = true;
    const currentTime = playerRef.current.getCurrentTime() + seconds;
    playerRef.current.seekTo(currentTime, true);
    socket.emit('seek', { currentTime });
    
    setTimeout(() => isLocalAction.current = false, 100);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
            Watch Party
          </h1>
          <p className="text-slate-300 text-lg" style={{ fontFamily: '"Inter", sans-serif' }}>
            Watch YouTube videos together in perfect sync
          </p>
        </div>

        {/* User Count / Connection Status */}
        <div className="flex justify-center mb-6">
          <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 flex items-center gap-2">
            <Users className="w-5 h-5 text-white" />
            {socket ? (
              <span className="text-white font-semibold">{userCount} {userCount === 1 ? 'viewer' : 'viewers'} online</span>
            ) : (
              <span className="text-slate-300 font-semibold">
                {isYouTubeAPIReady ? 'Connecting...' : 'Loading YouTube API...'}
              </span>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto space-y-6">
          {/* Video Input */}
          <Card className="bg-white/10 backdrop-blur-md border-white/20" data-testid="video-input-card">
            <CardHeader>
              <CardTitle className="text-white" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Add Video URL</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVideoSubmit} className="flex gap-3">
                <Input
                  data-testid="video-url-input"
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Paste YouTube URL here (e.g., https://www.youtube.com/watch?v=...)"
                  className="flex-1 bg-white/5 border-white/20 text-white placeholder:text-slate-400"
                />
                <Button 
                  data-testid="submit-video-btn"
                  type="submit" 
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Load Video
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Video Player */}
          <Card className="bg-white/10 backdrop-blur-md border-white/20" data-testid="video-player-card">
            <CardContent className="p-6">
              <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4 relative">
                {currentVideoId ? (
                  <>
                    <div id="youtube-player" className="w-full h-full" data-testid="youtube-player"></div>
                    {/* Transparent overlay to prevent direct clicks on video */}
                    <div className="absolute inset-0 pointer-events-auto cursor-default" 
                         onClick={(e) => e.preventDefault()} 
                         style={{ zIndex: 10 }}
                    />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Enter a YouTube URL to start watching</p>
                    </div>
                  </div>
                )}
              </div>

              {/* User Interaction Needed Banner */}
              {needsUserInteraction && currentVideoId && (
                <div className="mb-4 p-4 bg-yellow-500/20 border border-yellow-500/40 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Play className="w-5 h-5 text-yellow-400" />
                    <div>
                      <p className="text-white font-semibold">Video is playing for others</p>
                      <p className="text-slate-300 text-sm">Click to sync and start watching</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleSyncToSession}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                  >
                    Click to Sync
                  </Button>
                </div>
              )}

              {/* Controls */}
              {currentVideoId && playerReadyUI && (
                <div className="flex items-center justify-center gap-4" data-testid="video-controls">
                  <Button
                    data-testid="seek-backward-btn"
                    onClick={() => handleSeek(-10)}
                    variant="outline"
                    size="icon"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <SkipBack className="w-5 h-5" />
                  </Button>

                  {isPlaying ? (
                    <Button
                      data-testid="pause-btn"
                      onClick={handlePause}
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                    >
                      <Pause className="w-6 h-6 mr-2" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      data-testid="play-btn"
                      onClick={handlePlay}
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                    >
                      <Play className="w-6 h-6 mr-2" />
                      Play
                    </Button>
                  )}

                  <Button
                    data-testid="seek-forward-btn"
                    onClick={() => handleSeek(10)}
                    variant="outline"
                    size="icon"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <SkipForward className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="bg-white/10 backdrop-blur-md border-white/20" data-testid="instructions-card">
            <CardHeader>
              <CardTitle className="text-white" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>How it works</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-slate-300 space-y-2" style={{ fontFamily: '"Inter", sans-serif' }}>
                <li>• Everyone joins the same global watch session</li>
                <li>• Paste a YouTube URL to change the video for everyone</li>
                <li>• Use play, pause, and seek controls - all users will sync automatically</li>
                <li>• New joiners automatically sync to the current playback state</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
export default WatchParty;
