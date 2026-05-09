import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import UserEditor from './pages/UserEditor';
import Login from './pages/Login';
import './App.css';

axios.defaults.baseURL = '';
axios.defaults.withCredentials = true;

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await axios.get('/api/me');
      setIsAdmin(res.data.isAdmin);
    } catch (err) {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading-screen">Loading Avatar Frame Studio...</div>;

  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login onLogin={() => setIsAdmin(true)} />} />
          <Route 
            path="/admin" 
            element={isAdmin ? <AdminDashboard /> : <Navigate to="/login" />} 
          />
          <Route path="/edit/:templateId" element={<UserEditor />} />
          <Route path="/project/:projectId" element={<UserEditor />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
