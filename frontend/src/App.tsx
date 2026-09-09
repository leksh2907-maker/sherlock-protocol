import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import PlayerSetup from "./pages/PlayerSetup";
import Competition from "./pages/Competition";
import Round1 from "./pages/Round1";
import Round2 from "./pages/Round2";
import Round3 from "./pages/Round3";
import Login from "./pages/Login";
import Account from "./pages/Account";
import Contact from "./pages/Contact";
import Leaderboard from "./pages/Leaderboard";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/setup" element={<PlayerSetup />} />
      <Route path="/competition" element={<Competition />} />
      <Route path="/competition/round1" element={<Round1 />} />
      <Route path="/competition/round2" element={<Round2 />} />
      <Route path="/competition/round3" element={<Round3 />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/account" element={<Account />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
