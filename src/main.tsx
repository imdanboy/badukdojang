import { render } from 'preact'
import '@sabaki/shudan/css/goban.css'
import './index.css'
import { App } from './App.tsx'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('Root element #app not found in index.html')
}
render(<App />, root)
