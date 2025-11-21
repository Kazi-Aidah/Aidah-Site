export async function onRequest(context) {
  const playlistId = context.request.url.split("playlist=")[1];
  const apiKey = context.env.YT_API_KEY;

  const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;

  const yt = await fetch(apiUrl);
  const json = await yt.json();

  return new Response(JSON.stringify(json), {
    headers: { "Content-Type": "application/json" }
  });
}
