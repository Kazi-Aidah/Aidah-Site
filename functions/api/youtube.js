export async function onRequest(context) {
  try {
    // Get query parameters from the request URL
    const url = new URL(context.request.url);
    const playlistId = url.searchParams.get('playlist');
    const pageToken = url.searchParams.get('pageToken');
    const maxResults = url.searchParams.get('maxResults') || '50';
    
    // Get the API key from environment
    const apiKey = context.env.YT_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!playlistId) {
      return new Response(JSON.stringify({ error: 'playlist parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build the YouTube API URL
    let youtubeUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${maxResults}&playlistId=${playlistId}&key=${apiKey}`;
    
    // Add pageToken if provided
    if (pageToken) {
      youtubeUrl += `&pageToken=${pageToken}`;
    }

    const response = await fetch(youtubeUrl);
    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: data.error?.message || 'YouTube API error',
        details: data.error
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add CORS headers to allow requests from any origin
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Worker error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
