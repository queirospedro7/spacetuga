import { Routes, Route, Navigate } from 'react-router'
import Home from './pages/Home'
import { ThemeProvider } from './context/ThemeContext'
import { Toaster } from './components/ui/sonner'

export default function App() {
  return (
    <ThemeProvider>
      <Toaster />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  )
}
