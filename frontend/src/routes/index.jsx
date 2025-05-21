import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {Login} from '../pages/Login';
import { Home } from '../pages/Home';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  );
};
