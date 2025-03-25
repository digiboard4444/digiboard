import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import TeacherDashboard from './components/dashboard/TeacherDashboard';
import StudentDashboard from './components/dashboard/StudentDashboard';
import LiveWhiteboard from './components/dashboard/LiveWhiteboard';
import SavedLessons from './components/dashboard/SavedLessons';
import PrivateRoute from './components/auth/PrivateRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />
          
          {/* Teacher Routes */}
          <Route path="/teacher/*" element={
            <PrivateRoute role="teacher">
              <Routes>
                <Route path="dashboard" element={<TeacherDashboard />} />
              </Routes>
            </PrivateRoute>
          } />

          {/* Student Routes */}
          <Route path="/student/*" element={
            <PrivateRoute role="student">
              <Routes>
                <Route path="dashboard" element={<StudentDashboard />} />
                <Route path="live-whiteboard" element={<LiveWhiteboard />} />
                <Route path="saved-lessons" element={<SavedLessons />} />
              </Routes>
            </PrivateRoute>
          } />

          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;