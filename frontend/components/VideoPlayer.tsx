'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { API_URL } from '@/lib/api';

interface VideoPlayerProps {
  hlsPath: string | null;
  lessonId: string;
  sectionId?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  startTime?: number;
}

export default function VideoPlayer({
  hlsPath,
  lessonId,
  sectionId,
  onTimeUpdate,
  onEnded,
  autoPlay = false,
  startTime = 0,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCenterPlay, setShowCenterPlay] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Play/Pause toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
      setShowCenterPlay(false);
    } else {
      video.pause();
      setIsPlaying(false);
      setShowCenterPlay(true);
    }
  };

  // Seek forward/backward functions
  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration));
  };

  // Fetch signed URL for the video
  useEffect(() => {
    if (!hlsPath) {
      setSignedUrl(null);
      setIsLoading(false);
      return;
    }

    // Check if it's a local video path (starts with /videos/)
    if (hlsPath.startsWith('/videos/')) {
      // Local video - use as is
      setSignedUrl(hlsPath);
      return;
    }

    // All other paths (S3 object keys or full URLs) need signed URL from backend
    const fetchSignedUrl = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const licenseKey = localStorage.getItem('pro_license_key');
        const response = await fetch(`${API_URL}/api/get-video-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(licenseKey && { 'x-license-key': licenseKey }),
          },
          body: JSON.stringify({
            videoPath: hlsPath,
            sectionId: sectionId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to load video');
        }

        const data = await response.json();
        setSignedUrl(data.url);
      } catch (err: any) {
        console.error('Error fetching signed URL:', err);
        setError(err.message || 'Failed to load video URL');
        setIsLoading(false);
      }
    };

    fetchSignedUrl();
  }, [hlsPath, sectionId]);

  // Load video with signed URL
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedUrl) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Use the signed URL directly
    const videoUrl = signedUrl;

    // Check if HLS is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);

        // Set start time if provided
        if (startTime > 0) {
          video.currentTime = startTime;
        }

        // Auto play if enabled
        if (autoPlay) {
          video.play().catch(err => {
            console.error('Auto-play failed:', err);
          });
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error - please check your connection');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error - trying to recover');
              hls.recoverMediaError();
              break;
            default:
              setError('Fatal error - cannot play video');
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }
    // For browsers with native HLS support (Safari)
    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;

      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);

        if (startTime > 0) {
          video.currentTime = startTime;
        }

        if (autoPlay) {
          video.play().catch(err => {
            console.error('Auto-play failed:', err);
          });
        }
      });

      video.addEventListener('error', () => {
        setError('Error loading video');
        setIsLoading(false);
      });
    } else {
      setError('HLS is not supported in this browser');
      setIsLoading(false);
    }
  }, [signedUrl, lessonId, autoPlay, startTime]);

  // Handle time updates and play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (onTimeUpdate) {
        onTimeUpdate(video.currentTime, video.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setShowCenterPlay(true);
      if (onEnded) {
        onEnded();
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setShowCenterPlay(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setShowCenterPlay(true);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [onTimeUpdate, onEnded]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          seek(-10); // 10 seconds back
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(10); // 10 seconds forward
          break;
        case 'j':
          e.preventDefault();
          seek(-10);
          break;
        case 'l':
          e.preventDefault();
          seek(10);
          break;
        case ' ':
        case 'k':
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!hlsPath) {
    return (
      <div className="w-full aspect-video bg-gray-900 flex items-center justify-center rounded-lg">
        <div className="text-center text-gray-400">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <p className="text-lg font-semibold">This lesson is locked</p>
          <p className="text-sm mt-2">Upgrade to PRO to access this content</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-900 flex items-center justify-center rounded-lg">
        <div className="text-center text-red-400">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-semibold">Error Loading Video</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          playsInline
          preload="metadata"
        />

        {/* Simple Center Play Button */}
        {!isLoading && showCenterPlay && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer z-20"
            onClick={togglePlay}
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-5 transition-all hover:bg-black/80 hover:scale-105">
              <svg
                className="w-12 h-12 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
