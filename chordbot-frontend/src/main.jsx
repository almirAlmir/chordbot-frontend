import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
    <div style={{
      width: '100%',
      height: '100%'
    }}>
      <App />
    </div>
)
