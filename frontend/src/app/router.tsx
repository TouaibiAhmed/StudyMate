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
      { path: 'roadmaps/:roadmapId', element: <PlaceholderPage eyebrow="Learning path" title="Roadmap overview" description="Your roadmap modules and milestones will appear here." /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'exams/:examId', element: <PlaceholderPage eyebrow="Practice exam" title="Exam briefing" description="Review the exam instructions and begin when you are ready." /> },
      { path: 'exams/:examId/results', element: <PlaceholderPage eyebrow="Practice exam" title="Exam results" description="Your score, feedback, and recommended review topics will appear here." /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <PlaceholderPage eyebrow="Account" title="Settings" description="Manage notifications, study preferences, and your account." /> },
    ],
  },
])
