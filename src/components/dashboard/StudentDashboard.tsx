import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../layout/Layout';

const StudentDashboard = () => {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6 text-green-900">Welcome, {user?.firstName}!</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">
            Access your live whiteboard sessions or view saved lessons using the sidebar navigation.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default StudentDashboard;