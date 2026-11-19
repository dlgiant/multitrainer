import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ClientPage } from './pages/ClientPage';
import { ClientsPage } from './pages/ClientsPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { SessionDetail } from './pages/SessionDetail';
import { SessionPage } from './pages/SessionPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkoutEditor } from './pages/WorkoutEditor';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ClientsPage />} />
        <Route path="/clientes/:id" element={<ClientPage />} />
        <Route path="/clientes/:id/treinos/:wid" element={<WorkoutEditor />} />
        <Route path="/sessao/:sid" element={<SessionPage />} />
        <Route path="/sessoes/:sid" element={<SessionDetail />} />
        <Route path="/exercicios" element={<ExercisesPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
