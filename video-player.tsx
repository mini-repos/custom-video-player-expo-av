/**
 * VideoPlayer Component
 *
 * A robust video player component using expo-video (replaces deprecated expo-av).
 *
 * Features:
 * - Custom playback controls (play/pause, seek, volume, speed)
 * - Fullscreen support
 * - Progress tracking and auto-save
 * - Auto-hide controls
 * - Resume from last position
 * - Completion detection (95% threshold)
 *
 * @see https://docs.expo.dev/versions/latest/sdk/video/
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Dimensions, ActivityIndicator, PanResponder } from 'react-native';
import { VideoView, useVideoPlayer, VideoSource } from 'expo-video';
// import { Text } from './text';
import { PlayIcon, PauseIcon, Volume2Icon, VolumeXIcon, MaximizeIcon, MinimizeIcon, SettingsIcon } from './icon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface VideoPlayerProps {
    source: VideoSource;
    isFullscreen?: boolean;
    onFullscreenToggle?: () => void;
    onVideoEnd?: () => void;
    onProgress?: (progress: number, currentTimeInSeconds: number) => void;
    autoPlay?: boolean;
    startPosition?: number;
}

export function VideoPlayer({
    source,
    isFullscreen = false,
    onFullscreenToggle,
    onVideoEnd,
    onProgress,
    autoPlay = false,
    startPosition = 0,
}: VideoPlayerProps) {
    const player = useVideoPlayer(source, (player) => {
        player.loop = false;
        player.muted = false;
        player.volume = 1.0;
        player.playbackRate = 1.0;
    });

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [showSettings, setShowSettings] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const hasSetInitialPosition = useRef(false);

    const progress = duration > 0 ? currentTime / duration : 0;

    // Set initial position only once when video is ready
    useEffect(() => {
        if (!hasSetInitialPosition.current && player && duration > 0 && !isLoading) {
            if (startPosition > 0) {
                player.currentTime = startPosition;
            } else {
                player.currentTime = 0;
            }
            hasSetInitialPosition.current = true;
        }
    }, [startPosition, player, duration, isLoading]);

    // Auto-play if enabled
    useEffect(() => {
        if (autoPlay && player && !isLoading) {
            player.play();
            setIsPlaying(true);
        }
    }, [autoPlay, isLoading]);

    // Track playback progress
    useEffect(() => {
        if (!player) return;

        const updateProgress = () => {
            setCurrentTime(player.currentTime);
            setDuration(player.duration);
            setIsPlaying(player.playing);

            // Check if video ended
            if (player.currentTime >= player.duration && player.duration > 0) {
                if (onVideoEnd) {
                    onVideoEnd();
                }
            }

            // Report progress
            if (onProgress && player.duration > 0) {
                onProgress(player.currentTime / player.duration, player.currentTime);
            }
        };

        // Update progress every 500ms
        progressIntervalRef.current = setInterval(updateProgress, 500);

        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }
        };
    }, [player, onVideoEnd, onProgress]);

    // Listen to player status changes
    useEffect(() => {
        if (!player) return;

        const subscription = player.addListener('statusChange', (status) => {
            setIsLoading(status.status === 'loading');

            if (status.status === 'readyToPlay') {
                setDuration(player.duration);
                setIsLoading(false);
            }
        });

        return () => {
            subscription.remove();
        };
    }, [player]);

    // Auto-hide controls
    const resetControlsTimeout = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        setShowControls(true);

        if (isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (isPlaying) {
            resetControlsTimeout();
        }

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [isPlaying, resetControlsTimeout]);

    const togglePlayPause = useCallback(() => {
        if (!player) return;

        if (player.playing) {
            player.pause();
            setIsPlaying(false);
        } else {
            player.play();
            setIsPlaying(true);
        }
        resetControlsTimeout();
    }, [player, resetControlsTimeout]);

    const toggleMute = useCallback(() => {
        if (!player) return;
        player.muted = !player.muted;
    }, [player]);

    const changePlaybackRate = useCallback((rate: number) => {
        if (!player) return;
        player.playbackRate = rate;
        setPlaybackRate(rate);
        setShowSettings(false);
    }, [player]);

    const seekToPosition = useCallback(
        (position: number) => {
            if (!player || duration <= 0) return;

            // Clamp position to [0, 1] range
            const clampedPosition = Math.max(0, Math.min(position, 1));
            const targetTime = clampedPosition * duration;

            // Calculate how far we need to seek from the current time
            const delta = targetTime - player.currentTime;

            // If the delta is very small, avoid an unnecessary native seek
            if (Math.abs(delta) < 0.1) {
                setCurrentTime(targetTime);
                return;
            }

            // Use expo-video's dedicated seeking API for robustness
            try {
                player.seekBy(delta);
            } catch {
                // Fallback to directly setting currentTime if seekBy fails for any reason
                player.currentTime = targetTime;
            }

            // Optimistically update local state so UI reflects the new position immediately
            setCurrentTime(targetTime);
        },
        [player, duration]
    );

    // Handle progress bar touch
    const handleProgressBarTouch = useCallback((event: any, isFromPanResponder = false) => {
        if (!player || duration <= 0) return;

        const { width: currentWidth } = Dimensions.get('window');
        const progressBarWidth = (isFullscreen ? currentWidth : SCREEN_WIDTH) - 32;

        // Get the touch position relative to the progress bar
        // In React Native, we use locationX which is relative to the component
        const touchX = event.nativeEvent.locationX;
        const clampedTouchX = Math.max(0, Math.min(touchX, progressBarWidth));
        const newProgress = clampedTouchX / progressBarWidth;

        seekToPosition(newProgress);
    }, [isFullscreen, seekToPosition, player, duration]);

    // Handle direct tap on progress bar (not through pan responder)
    const handleProgressBarTap = useCallback((event: any) => {
        if (!player || duration <= 0) return;

        const { width: currentWidth } = Dimensions.get('window');
        const progressBarWidth = (isFullscreen ? currentWidth : SCREEN_WIDTH) - 32;

        // Get the touch position relative to the progress bar
        const touchX = event.nativeEvent.locationX;
        const clampedTouchX = Math.max(0, Math.min(touchX, progressBarWidth));
        const newProgress = clampedTouchX / progressBarWidth;

        seekToPosition(newProgress);
        resetControlsTimeout();
    }, [isFullscreen, seekToPosition, resetControlsTimeout, player, duration]);

    // Pan responder for draggable progress bar
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (event) => {
                setIsDragging(true);
                if (controlsTimeoutRef.current) {
                    clearTimeout(controlsTimeoutRef.current);
                }
                handleProgressBarTouch(event, true);
            },
            onPanResponderMove: (event) => {
                handleProgressBarTouch(event, true);
            },
            onPanResponderRelease: (event) => {
                handleProgressBarTouch(event, true);
                setIsDragging(false);
                resetControlsTimeout();
            },
        })
    ).current;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleVideoPress = () => {
        if (showControls) {
            setShowControls(false);
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        } else {
            resetControlsTimeout();
        }
    };

    // Get current dimensions (will be swapped in landscape)
    const { width: currentWidth, height: currentHeight } = Dimensions.get('window');
    const videoWidth = isFullscreen ? currentWidth : SCREEN_WIDTH;
    const videoHeight = isFullscreen ? currentHeight : SCREEN_WIDTH * 0.56;

    return (
        <View className="relative bg-black" style={{ width: videoWidth, height: videoHeight }}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={handleVideoPress}
                style={{ width: videoWidth, height: videoHeight }}
            >
                <VideoView
                    player={player}
                    style={{ width: videoWidth, height: videoHeight }}
                    contentFit="contain"
                    nativeControls={false}
                />
            </TouchableOpacity>

            {/* Loading Indicator */}
            {isLoading && (
                <View className="absolute inset-0 justify-center items-center bg-black/50">
                    <ActivityIndicator size="large" color="#ffffff" />
                </View>
            )}

            {/* Controls Overlay */}
            {showControls && !isLoading && (
                <>
                    {/* Center Play/Pause Button */}
                    <View className="absolute inset-0 justify-center items-center">
                        <TouchableOpacity
                            onPress={togglePlayPause}
                            className="p-6 bg-white/20 backdrop-blur-xl rounded-full"
                            activeOpacity={0.7}
                        >
                            {isPlaying ? (
                                <PauseIcon size={isFullscreen ? 48 : 40} color="#ffffff" />
                            ) : (
                                <View style={{ marginLeft: 4 }}>
                                    <PlayIcon size={isFullscreen ? 48 : 40} color="#ffffff" />
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Bottom Controls */}
                    <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4">
                        {/* Progress Bar with Draggable Thumb */}
                        <View className="w-full mb-3">
                            <TouchableOpacity
                                className="relative"
                                style={{ paddingVertical: 8 }}
                                onPress={handleProgressBarTap}
                                activeOpacity={1}
                                {...panResponder.panHandlers}
                            >
                                <View
                                    className="h-1 bg-white/30 rounded-full relative"
                                >
                                    <View
                                        className="h-1 bg-white rounded-full"
                                        style={{ width: `${progress * 100}%` }}
                                    />
                                    {/* Draggable Thumb */}
                                    <View
                                        className="absolute bg-white rounded-full shadow-lg"
                                        style={{
                                            width: 14,
                                            height: 14,
                                            top: -6.5,
                                            left: `${progress * 100}%`,
                                            marginLeft: -7,
                                            borderWidth: 2,
                                            borderColor: isDragging ? '#60a5fa' : '#ffffff',
                                            shadowColor: '#000',
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 3,
                                            elevation: 5,
                                        }}
                                    />
                                </View>
                            </TouchableOpacity>
                        </View>

                        {/* Control Buttons */}
                        <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center" style={{ gap: 16 }}>
                                <TouchableOpacity onPress={togglePlayPause} activeOpacity={0.7}>
                                    {isPlaying ? (
                                        <PauseIcon size={20} color="#ffffff" />
                                    ) : (
                                        <PlayIcon size={20} color="#ffffff" />
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity onPress={toggleMute} activeOpacity={0.7}>
                                    {player?.muted ? (
                                        <VolumeXIcon size={20} color="#ffffff" />
                                    ) : (
                                        <Volume2Icon size={20} color="#ffffff" />
                                    )}
                                </TouchableOpacity>

                                <Text size="xs" style={{ color: '#ffffff' }}>
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </Text>
                            </View>

                            <View className="flex-row items-center" style={{ gap: 12 }}>
                                <TouchableOpacity
                                    onPress={() => setShowSettings(!showSettings)}
                                    activeOpacity={0.7}
                                >
                                    <SettingsIcon size={20} color="#ffffff" />
                                </TouchableOpacity>
                                {onFullscreenToggle && (
                                    <TouchableOpacity onPress={onFullscreenToggle} activeOpacity={0.7}>
                                        {isFullscreen ? (
                                            <MinimizeIcon size={20} color="#ffffff" />
                                        ) : (
                                            <MaximizeIcon size={20} color="#ffffff" />
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Settings Menu */}
                    {showSettings && (
                        <View className="absolute bottom-20 right-4 bg-black/90 backdrop-blur-xl rounded-lg border border-white/20 p-2">
                            <Text size="xs" variant="muted" style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                                Playback Speed
                            </Text>
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                <TouchableOpacity
                                    key={rate}
                                    onPress={() => changePlaybackRate(rate)}
                                    className="px-4 py-2 rounded"
                                    style={{
                                        backgroundColor: playbackRate === rate ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text size="sm" style={{ color: '#ffffff' }}>
                                        {rate}x
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </>
            )}
        </View>
    );
}
