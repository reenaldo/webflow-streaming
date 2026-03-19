export interface Lesson {
  id: string;
  title: string;
  originalName: string;
  hlsPath: string | null;
  duration: number | null;
  locked?: boolean;
}

export interface Section {
  id: number;
  title: string;
  originalName: string;
  isPro: boolean;
  lessons: Lesson[];
}

export interface CourseData {
  title: string;
  sections: Section[];
  userAccess?: {
    isPro: boolean;
  };
}

export interface LessonProgress {
  lessonId: string;
  progress: number;
  completed: boolean;
  timestamp: number;
}
