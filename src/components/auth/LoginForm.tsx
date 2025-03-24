import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const LoginForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  // Use states
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState({
    email: '',
    password: '',
    general: '',
  });

  //Use effects
  
  useEffect(() => {
    if (error.general) {
      const timer = setTimeout(() => {
        setError((prevError) => ({ ...prevError, general: '' }));
      }, 3000); // Clear the general error after 5 seconds

      return () => clearTimeout(timer); // Cleanup the timer on component unmount
    }
  }, [error.general]);

  // Functions
  // Error handler for the target value
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError({ ...error, [e.target.name]: '', general: '' });
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;
    // Validations for the required input fields
    if (!formData.email) {
      setError((prevError) => ({ ...prevError, email: 'Email is required' }));
      valid = false;
    } else if (!validateEmail(formData.email)) {
      setError((prevError) => ({ ...prevError, email: 'Invalid email format' }));
      valid = false;
    }

    if (!formData.password) {
      setError((prevError) => ({ ...prevError, password: 'Password is required' }));
      valid = false;
    } else if (formData.password.length < 6) {
      setError((prevError) => ({ ...prevError, password: 'Password must be at least 6 characters long' }));
      valid = false;
    }

    if (!valid) return;

    try {
      // if user successfully login
      await login(formData.email, formData.password);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const from = location.state?.from?.pathname || `/${user.role}/dashboard`;
      navigate(from, { replace: true });
    } catch (err) {
      setError((prevError) => ({ ...prevError, general: 'Invalid credentials' }));
    }
  };

  return (
    <div className="min-h-screen bg-green-950 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-slate-100 p-6 rounded-lg shadow">
        <div>
          <h1 className="text-3xl font-bold text-center text-green-950">LOGIN</h1>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error.general && <div className="bg-rose-700 text-slate-50 text-center p-2 rounded-md">{error.general}</div>}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                className={`appearance-none rounded-md relative block w-full px-3 py-2 border ${
                  error.email ? 'border-red-500' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm`}
                value={formData.email}
                onChange={handleChange}
              />
              {error.email && <p className="mt-2 text-sm text-red-600">{error.email}</p>}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className={`appearance-none rounded-md relative block w-full px-3 py-2 border ${
                  error.password ? 'border-red-500' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm`}
                value={formData.password}
                onChange={handleChange}
              />
              {error.password && <p className="mt-2 text-sm text-red-600">{error.password}</p>}
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Sign in
            </button>
          </div>

          <div className="text-center">
            <span className="text-sm text-gray-500">Don't have an account?</span>
            <Link to="/register" className="text-sm text-green-600 hover:text-green-700">
            Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;