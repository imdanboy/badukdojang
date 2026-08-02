import { createRoot } from 'react-dom/client'
import '@kaya/shudan/dist/goban.css'
import './index.css'
import { App } from './App.tsx'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('Root element #app not found in index.html')
}
createRoot(root).render(<App />)
