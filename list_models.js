require('dotenv').config({ path: '.env.development' });
const fs = require('fs');

async function checkModels() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    let out = "Available Models:\n";
    if (data.models) {
      data.models.forEach(m => {
        if (m.name.includes('gemini')) {
            out += `- ${m.name} : supportedMethods=[${m.supportedGenerationMethods.join(',')}]\n`;
        }
      });
      fs.writeFileSync('models.txt', out, 'utf-8');
      console.log('Saved to models.txt');
    } else {
      console.log(data);
    }
  } catch (error) {
    console.error("Error fetching models:", error);
  }
}

checkModels();
