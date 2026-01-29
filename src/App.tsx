import { usePlatform } from './hooks/usePlatform'
import DesktopApp from './DesktopApp'
import MobileApp from './MobileApp'

function App() {
  const { isMobile, isLoading } = usePlatform()

  if (isLoading) {
    return <div className="h-screen bg-background" />
  }

  return isMobile ? <MobileApp /> : <DesktopApp />
}

export default App
