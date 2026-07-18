const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
let apiPromise = null

export function normalizeYouTubeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('YouTube URL is required')

  let url
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    throw new Error('Invalid YouTube URL')
  }

  const host = url.hostname.toLowerCase()
  let videoId = ''
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || ''
  } else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
      'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)
  ) {
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.pathname.replace(/\/$/, '') === '/watch') videoId = url.searchParams.get('v') || ''
    else if (parts.length >= 2 && ['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1]
  } else {
    throw new Error('Only youtube.com and youtu.be links are supported')
  }

  if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error('Invalid YouTube video link')
  return {
    provider: 'youtube',
    video_id: videoId,
    canonical_url: `https://www.youtube.com/watch?v=${videoId}`
  }
}

export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady()
      resolve(window.YT)
    }

    let script = document.getElementById('youtube-iframe-api')
    if (!script) {
      script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('error', () => reject(new Error('Unable to load YouTube Player API')), {
      once: true
    })
  })
  return apiPromise
}

export function playerStateName(value) {
  const states = {
    0: 'ended',
    1: 'playing',
    2: 'paused',
    3: 'buffering',
    5: 'cued'
  }
  return states[value] || 'not_ready'
}
