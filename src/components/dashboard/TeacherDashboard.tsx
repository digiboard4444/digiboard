import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../layout/Layout';
import TeacherWhiteboard from '../Whiteboard/TeacherWhiteboard';

const TeacherDashboard = () => {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Welcome, {user?.firstName}!</h1>
        <div className="bg-white rounded-lg shadow">
          <TeacherWhiteboard />
        </div>
      </div>
    </Layout>
  );
};

export default TeacherDashboard;