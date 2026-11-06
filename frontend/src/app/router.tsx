import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { CoursesPage } from '../pages/CoursesPage'
import { StudySessionPage } from '../pages/StudySessionPage'
import { ProgressPage } from '../pages/ProgressPage'
import { RoadmapsPage } from '../pages/RoadmapsPage'
import { ExamsPage } from '../pages/ExamsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { CourseDetailPage } from '../pages/CourseDetailPage'
import { RoadmapDetailPage } from '../pages/RoadmapDetailPage'
import { ActiveExamPage } from '../pages/ActiveExamPage'
import { ExamResultsPage } from '../pages/ExamResultsPage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { SettingsPage } from '../pages/SettingsPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { SignupPage } from '../features/auth/pages/SignupPage'
import { ChatPage } from '../pages/ChatPage'
import { SummaryGeneratorPage } from '../pages/SummaryGeneratorPage'
import { QuizGeneratorPage } from '../pages/QuizGeneratorPage'
import { QuizPlayerPage } from '../pages/QuizPlayerPage'
import { ProtectedRoute, PublicRoute } from '../features/auth/components/AuthRouteGuards'

export const router = createBrowserRouter([
  { path: '/login', element: <PublicRoute><LoginPage /></PublicRoute> },
  { path: '/signup', element: <PublicRoute><SignupPage /></PublicRoute> },
  { path: '/onboarding', element: <ProtectedRoute><OnboardingPage /></ProtectedRoute> },
  {
    path: '/',
    element: <ProtectedRoute><AppShell /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'courses/:courseId', element: <CourseDetailPage /> },
      { path: 'courses/:courseId/summaries/:summaryId', element: <SummaryGeneratorPage /> },
      { path: 'courses/:courseId/quizzes/:quizId', element: <QuizGeneratorPage /> },
      { path: 'courses/:courseId/quizzes/:quizId/play', element: <QuizPlayerPage /> },
      { path: 'study/:sessionId', element: <StudySessionPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'roadmaps', element: <RoadmapsPage /> },
      { path: 'roadmaps/:roadmapId', element: <RoadmapDetailPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'exams/:examId', element: <ActiveExamPage /> },
      { path: 'exams/:examId/results', element: <ExamResultsPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
