import { LessonProgress } from './types';

const PROGRESS_KEY = 'course_progress';
const CURRENT_LESSON_KEY = 'current_lesson';

export function saveProgress(lessonId: string, progress: number, completed: boolean): void {
  if (typeof window === 'undefined') return;

  const progressData: LessonProgress = {
    lessonId,
    progress,
    completed,
    timestamp: Date.now(),
  };

  const allProgress = getAllProgress();
  allProgress[lessonId] = progressData;

  localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
}

export function getProgress(lessonId: string): LessonProgress | null {
  if (typeof window === 'undefined') return null;

  const allProgress = getAllProgress();
  return allProgress[lessonId] || null;
}

export function getAllProgress(): Record<string, LessonProgress> {
  if (typeof window === 'undefined') return {};

  try {
    const data = localStorage.getItem(PROGRESS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading progress:', error);
    return {};
  }
}

export function saveCurrentLesson(lessonId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENT_LESSON_KEY, lessonId);
}

export function getCurrentLesson(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CURRENT_LESSON_KEY);
}

export function clearProgress(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(CURRENT_LESSON_KEY);
}
