import axios from 'axios';
import { CourseData } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Function to get the current license key from localStorage
function getLicenseKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pro_license_key');
}

// Create API instance with dynamic headers
function createApiInstance() {
  const licenseKey = getLicenseKey();
  return axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
      ...(licenseKey && { 'x-license-key': licenseKey }),
    },
  });
}

export async function fetchCourseData(): Promise<CourseData> {
  const api = createApiInstance();
  const response = await api.get('/api/course');
  return response.data;
}

export async function fetchLesson(lessonId: string) {
  const api = createApiInstance();
  const response = await api.get(`/api/lessons/${lessonId}`);
  return response.data;
}

export async function updateProgress(lessonId: string, progress: number, completed: boolean) {
  const api = createApiInstance();
  const response = await api.post('/api/progress', {
    lessonId,
    progress,
    completed,
  });
  return response.data;
}

export { API_URL };
