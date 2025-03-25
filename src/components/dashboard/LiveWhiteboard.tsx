import React, { useState } from 'react';
import Layout from '../layout/Layout';
import StudentWhiteboard from '../Whiteboard/StudentWhiteboard';
import { Video } from 'lucide-react';

const LiveWhiteboard = () => {
  const [hasJoined, setHasJoined] = useState(false);

  const handleJoinSession = () => {
    setHasJoined(true);
  };

  if (!hasJoined) {
    return (
      <Layout>
        <div className="p-6">
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold mb-4">Join Live Whiteboard Session</h2>
              <p className="text-gray-600 mb-8">
                Join a live whiteboard session with your teacher. The session will be automatically recorded and saved for later review.
              </p>
              <button
                onClick={handleJoinSession}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg mx-auto transition-colors"
              >
                <Video size={20} />
                Join Live Session
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="bg-white rounded-lg shadow">
          <StudentWhiteboard />
        </div>
      </div>
    </Layout>
  );
};

export default LiveWhiteboard;