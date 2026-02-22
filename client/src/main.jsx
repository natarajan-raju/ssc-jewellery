import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const appNode = googleClientId ? (
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
)

ReactDOM.createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? appNode : <React.StrictMode>{appNode}</React.StrictMode>,
)
