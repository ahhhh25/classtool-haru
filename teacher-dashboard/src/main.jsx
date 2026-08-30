import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.jsx"
import KioskPage from "./components/KioskPage.jsx"
import { ThemeProvider } from "./theme/ThemeProvider.jsx"
import { isKioskRoute } from "./utils/kioskTokens.js"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      {isKioskRoute() ? <KioskPage /> : <App />}
    </ThemeProvider>
  </StrictMode>,
)
