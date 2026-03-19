'use client';

import { useEffect, useState, useCallback } from 'react';
import VideoPlayer from '@/components/VideoPlayer';
import Sidebar from '@/components/Sidebar';
import LicenseModal from '@/components/LicenseModal';
import LicenseInfoModal from '@/components/LicenseInfoModal';
import { fetchCourseData, updateProgress } from '@/lib/api';
import { CourseData, Lesson, Section, LessonProgress } from '@/lib/types';
import {
  saveProgress,
  getAllProgress,
  saveCurrentLesson,
  getCurrentLesson,
} from '@/lib/storage';

export default function Home() {
  const [courseData, setCourseData] = useState<CourseData | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [currentSection, setCurrentSection] = useState<Section | null>(null);
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showLicenseInfo, setShowLicenseInfo] = useState(false);
  const [isPro, setIsPro] = useState(false);

  // Load course data
  useEffect(() => {
    async function loadCourse() {
      try {
        setLoading(true);

        const data = await fetchCourseData();
        setCourseData(data);

        // Set isPro based on backend validation (not just localStorage)
        // The backend checks if the license is valid, active, and not expired
        if (data.userAccess?.isPro) {
          setIsPro(true);
        } else {
          // License is invalid/banned/expired - clear it from localStorage
          setIsPro(false);
          localStorage.removeItem('pro_license_key');
          localStorage.removeItem('pro_user');
        }

        // Load progress from localStorage
        const savedProgress = getAllProgress();
        setProgress(savedProgress);

        // Load last watched lesson
        const lastLessonId = getCurrentLesson();
        if (lastLessonId) {
          // Find the lesson
          for (const section of data.sections) {
            const lesson = section.lessons.find(l => l.id === lastLessonId);
            if (lesson && !lesson.locked) {
              setCurrentLesson(lesson);
              setCurrentSection(section);
              break;
            }
          }
        }

        // If no last lesson, start with first available lesson
        if (!lastLessonId || !currentLesson) {
          for (const section of data.sections) {
            const firstLesson = section.lessons.find(l => !l.locked);
            if (firstLesson) {
              setCurrentLesson(firstLesson);
              setCurrentSection(section);
              break;
            }
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading course:', err);
        setError('Failed to load course. Please refresh the page.');
        setLoading(false);
      }
    }

    loadCourse();
  }, []);

  // Periodically check if license is still valid (every 5 minutes)
  useEffect(() => {
    const licenseKey = localStorage.getItem('pro_license_key');

    // Only set up interval if user has a license
    if (!licenseKey) return;

    const checkLicenseValidity = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/validate-license`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ licenseKey }),
        });

        const data = await response.json();

        if (!data.valid) {
          // License is no longer valid - force reload to clear PRO access
          console.log('License is no longer valid. Reloading...');
          localStorage.removeItem('pro_license_key');
          localStorage.removeItem('pro_user');
          window.location.reload();
        }
      } catch (error) {
        console.error('Error checking license validity:', error);
      }
    };

    // Check every 5 minutes
    const interval = setInterval(checkLicenseValidity, 5 * 60 * 1000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, []);

  // Handle lesson selection
  const handleLessonSelect = useCallback((lesson: Lesson, sectionId: number) => {
    if (lesson.locked) return;

    const section = courseData?.sections.find(s => s.id === sectionId);
    if (!section) return;

    setCurrentLesson(lesson);
    setCurrentSection(section);
    saveCurrentLesson(lesson.id);
  }, [courseData]);

  // Handle video time update with throttling
  const lastProgressRef = useState({ lessonId: '', progress: -1 })[0];

  const handleTimeUpdate = useCallback(
    async (currentTime: number, duration: number) => {
      if (!currentLesson || !duration || duration === Infinity) return;

      const progressPercent = Math.floor((currentTime / duration) * 100);

      // Don't update if progress hasn't changed
      if (lastProgressRef.lessonId === currentLesson.id && lastProgressRef.progress === progressPercent) {
        return;
      }

      lastProgressRef.lessonId = currentLesson.id;
      lastProgressRef.progress = progressPercent;

      const completed = progressPercent >= 90;

      // Update local progress
      saveProgress(currentLesson.id, progressPercent, completed);
      setProgress(prev => ({
        ...prev,
        [currentLesson.id]: {
          lessonId: currentLesson.id,
          progress: progressPercent,
          completed,
          timestamp: Date.now(),
        },
      }));

      // Update server only every 10% or on completion
      if (progressPercent > 0 && (progressPercent % 10 === 0 || completed)) {
        try {
          await updateProgress(currentLesson.id, progressPercent, completed);
        } catch (err) {
          console.error('Error updating progress:', err);
        }
      }
    },
    [currentLesson, lastProgressRef]
  );

  // Handle license activation success
  const handleLicenseSuccess = useCallback((userData: { firstName: string; lastName: string }) => {
    setIsPro(true);
    // Reload page to refresh course data with PRO access
    window.location.reload();
  }, []);

  // Handle video ended - auto-play next lesson
  const handleVideoEnded = useCallback(() => {
    if (!currentLesson || !currentSection || !courseData || !autoPlayNext) return;

    // Mark current lesson as completed
    saveProgress(currentLesson.id, 100, true);
    setProgress(prev => ({
      ...prev,
      [currentLesson.id]: {
        lessonId: currentLesson.id,
        progress: 100,
        completed: true,
        timestamp: Date.now(),
      },
    }));

    // Find next lesson
    const currentLessonIndex = currentSection.lessons.findIndex(
      l => l.id === currentLesson.id
    );

    // Try next lesson in current section
    if (currentLessonIndex < currentSection.lessons.length - 1) {
      const nextLesson = currentSection.lessons[currentLessonIndex + 1];
      if (!nextLesson.locked) {
        handleLessonSelect(nextLesson, currentSection.id);
        return;
      }
    }

    // Try first lesson in next section
    const currentSectionIndex = courseData.sections.findIndex(
      s => s.id === currentSection.id
    );

    for (let i = currentSectionIndex + 1; i < courseData.sections.length; i++) {
      const nextSection = courseData.sections[i];
      const firstLesson = nextSection.lessons.find(l => !l.locked);
      if (firstLesson) {
        handleLessonSelect(firstLesson, nextSection.id);
        return;
      }
    }

    // No more lessons - course completed
    console.log('Course completed!');
  }, [currentLesson, currentSection, courseData, autoPlayNext, handleLessonSelect]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
          <p className="text-white mt-4 text-lg">Loading course...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center text-red-400">
          <svg
            className="mx-auto h-16 w-16 mb-4"
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
          <p className="text-xl font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  if (!courseData) return null;

  const savedProgress = currentLesson ? progress[currentLesson.id] : null;

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-2xl font-bold text-white truncate">{courseData.title}</h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden sm:flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPlayNext}
                onChange={(e) => setAutoPlayNext(e.target.checked)}
                className="rounded"
              />
              Auto-play next
            </label>
            {isPro || courseData.userAccess?.isPro ? (
              <button
                onClick={() => setShowLicenseInfo(true)}
                className="px-2 sm:px-3 py-1 sm:py-1.5 bg-purple-900/50 text-purple-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-purple-900/70 transition-colors cursor-pointer"
              >
                PRO
              </button>
            ) : (
              <button
                onClick={() => setShowLicenseModal(true)}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Area */}
        <main className="flex flex-col overflow-hidden lg:flex-1 lg:order-2">
          {currentLesson ? (
            <>
              {/* Lesson Info - Fixed at top */}
              <div className="bg-gray-900/50 border-b border-gray-800 px-2 sm:px-6 py-2 sm:py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm sm:text-lg font-bold text-white truncate">
                      {currentLesson.title}
                    </h2>
                    {currentSection && (
                      <p className="text-xs text-gray-400 truncate mt-0.5 sm:mt-1">
                        {currentSection.title}
                        {currentSection.isPro && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-900/50 text-purple-300">
                            PRO
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {savedProgress && savedProgress.completed && (
                    <div className="flex items-center gap-1 text-green-500 flex-shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-xs font-medium hidden sm:inline">Completed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Video Player Container - Mobile responsive */}
              <div className="bg-black lg:flex-1 lg:flex lg:items-center lg:justify-center lg:p-6 lg:overflow-hidden">
                <div className="w-full lg:max-w-6xl">
                  <VideoPlayer
                    hlsPath={currentLesson.hlsPath}
                    lessonId={currentLesson.id}
                    sectionId={currentSection?.id}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleVideoEnded}
                    autoPlay={false}
                    startTime={0}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <p className="text-base sm:text-xl">Select a lesson to start learning</p>
              </div>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="flex-1 lg:w-96 lg:flex-shrink-0 lg:flex-none overflow-hidden lg:order-1">
          <Sidebar
            sections={courseData.sections}
            currentLessonId={currentLesson?.id || null}
            onLessonSelect={handleLessonSelect}
            progress={progress}
            isPro={courseData.userAccess?.isPro || false}
          />
        </aside>
      </div>

      {/* License Activation Modal */}
      <LicenseModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
        onSuccess={handleLicenseSuccess}
      />

      {/* License Info Modal */}
      <LicenseInfoModal
        isOpen={showLicenseInfo}
        onClose={() => setShowLicenseInfo(false)}
      />
    </div>
  );
}
