'use client';

import { Section, Lesson, LessonProgress } from '@/lib/types';
import { useState } from 'react';

interface SidebarProps {
  sections: Section[];
  currentLessonId: string | null;
  onLessonSelect: (lesson: Lesson, sectionId: number) => void;
  progress: Record<string, LessonProgress>;
  isPro: boolean;
}

export default function Sidebar({
  sections,
  currentLessonId,
  onLessonSelect,
  progress,
  isPro,
}: SidebarProps) {
  // Start with all sections collapsed (empty set)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const toggleSection = (sectionId: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const getLessonProgress = (lessonId: string): number => {
    return progress[lessonId]?.progress || 0;
  };

  const isLessonCompleted = (lessonId: string): boolean => {
    return progress[lessonId]?.completed || false;
  };

  return (
    <div className="h-full bg-gray-900 border-r lg:border-r border-t lg:border-t-0 border-gray-800 overflow-y-auto">
      <div className="p-3 sm:p-4 border-b border-gray-800">
        <h2 className="text-lg sm:text-xl font-bold text-white">Course Content</h2>
        {!isPro && (
          <div className="mt-2 text-xs text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">
            Free Access - Upgrade for PRO sections
          </div>
        )}
      </div>

      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        {sections.map((section, sectionIndex) => {
          const sectionLocked = section.isPro && !isPro;
          const isExpanded = expandedSections.has(section.id);

          return (
            <div key={section.id} className="space-y-1 sm:space-y-2">
              {/* Section Header - Clickable */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full px-2 sm:px-3 py-2 bg-gray-800/60 hover:bg-gray-800 rounded-lg border border-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Expand/Collapse Arrow */}
                  <svg
                    className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-400 transition-transform flex-shrink-0 ${
                      isExpanded ? 'transform rotate-90' : ''
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>

                  <span className="text-xs font-bold text-primary flex-shrink-0">
                    {String(sectionIndex + 1).padStart(2, '0')}
                  </span>
                  <span className="font-bold text-white text-xs sm:text-sm flex-1 text-left">
                    {section.title}
                  </span>
                  {section.isPro && (
                    <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium bg-purple-900/50 text-purple-300 flex-shrink-0">
                      PRO
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1 ml-6 sm:ml-10 text-left">
                  {section.lessons.length} lesson{section.lessons.length !== 1 ? 's' : ''}
                </div>
              </button>

              {/* Lessons - Show only when expanded */}
              {isExpanded && (
                <div className="space-y-1 pl-1 sm:pl-2">
                  {section.lessons.map((lesson, index) => {
                    const isActive = currentLessonId === lesson.id;
                    const lessonProgress = getLessonProgress(lesson.id);
                    const completed = isLessonCompleted(lesson.id);
                    const locked = lesson.locked || sectionLocked;

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => !locked && onLessonSelect(lesson, section.id)}
                        disabled={locked}
                        className={`w-full flex items-start p-2 sm:p-2.5 rounded-lg text-left transition-all ${
                          isActive
                            ? 'bg-primary text-white shadow-lg'
                            : locked
                            ? 'text-gray-500 cursor-not-allowed opacity-60'
                            : 'text-gray-300 hover:bg-gray-800 hover:shadow-md'
                        }`}
                      >
                        <div className="flex-shrink-0 mr-2 sm:mr-3 mt-0.5">
                          {locked ? (
                            <svg
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : completed ? (
                            <svg
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : isActive ? (
                            <svg
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-gray-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm font-medium truncate">
                            {index + 1}. {lesson.title}
                          </div>

                          {!locked && lessonProgress > 0 && !completed && (
                            <div className="mt-1 sm:mt-1.5 w-full bg-gray-700 rounded-full h-1">
                              <div
                                className="bg-primary h-1 rounded-full transition-all"
                                style={{ width: `${lessonProgress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
