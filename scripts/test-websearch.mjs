import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  temperature: 0.3,
  system: 'You are a knowledgeable assistant for construction professionals (MEP contractors). Answer questions using current web information. Be concise and practical. Always cite the web sources you used in your answer.',
  messages: [{ role: 'user', content: 'How is the weather in Seattle?' }],
  tools: [{ type: 'web_search_20250305', name: 'web_search' }],
});

let content = '';
const citations = [];
const seenUrls = new Set();

for (const block of response.content) {
  if (block.type === 'text') {
    content += block.text;
  } else if (block.type === 'web_search_tool_result') {
    for (const result of (block.content ?? [])) {
      if (result.type === 'web_search_result' && result.url && !seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        citations.push({ url: result.url, title: result.title ?? result.url });
      }
    }
  }
}

console.log('SUCCESS');
console.log('Content length:', content.length);
console.log('Content preview:', content.slice(0, 200));
console.log('Citations count:', citations.length);
console.log('Citations:', JSON.stringify(citations.slice(0, 3), null, 2));
