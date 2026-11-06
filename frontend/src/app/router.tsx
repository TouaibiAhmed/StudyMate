import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { CoursesPage } from '../pages/CoursesPage'
import { StudySessionPage } from '../pages/StudySessionPage'
import { ProgressPage } from '../pages/ProgressPage'
import { RoadmapsPage } from '../pages/RoadmapsPage'
import { ExamsPage } from '../pages/ExamsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { CourseDetailPage } from '../pages/CourseDetailPage'
import { RoadmapDetailPage } from '../pages/RoadmapDetailPage'
import { ActiveExamPage } from '../pages/ActiveExamPage'
import { ExamResultsPage } from '../pages/ExamResultsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'courses/:courseId', element: <CourseDetailPage /> },
      { path: 'study/:sessionId', element: <StudySessionPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'roadmaps', element: <RoadmapsPage /> },
      { path: 'roadmaps/:roadmapId', element: <RoadmapDetailPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'exams/:examId', element: <ActiveExamPage /> },
      { path: 'exams/:examId/results', element: <ExamResultsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <PlaceholderPage eyebrow="Account" title="Settings" description="Manage notifications, study preferences, and your account." /> },
    ],
  },
])
