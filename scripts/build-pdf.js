import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const BASE_PATH = '/cs_study';
const PORT = 8080;

// 1. Check if dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  console.error('Error: dist directory does not exist. Please run "npm run build" first.');
  process.exit(1);
}

// 2. Simple static file server supporting base path /cs_study
const server = http.createServer((req, res) => {
  let reqPath = req.url || '/';
  
  // Strip query parameters
  reqPath = reqPath.split('?')[0];

  // Verify base path
  if (!reqPath.startsWith(BASE_PATH)) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  // Resolve to file system path inside dist/
  let relativePath = reqPath.substring(BASE_PATH.length);
  if (relativePath === '' || relativePath === '/') {
    relativePath = '/index.html';
  }

  let filePath = path.join(DIST_DIR, relativePath);

  // If request is a directory (e.g., /chapter1/section1), try serving index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // File extension matching for MIME types
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If file doesn't exist, try append .html (for extensionless routing)
      if (err.code === 'ENOENT') {
        const fallbackPath = filePath + '.html';
        if (fs.existsSync(fallbackPath) && !fs.statSync(fallbackPath).isDirectory()) {
          fs.readFile(fallbackPath, (fallbackErr, fallbackData) => {
            if (fallbackErr) {
              res.statusCode = 404;
              res.end(`File not found: ${reqPath}`);
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(fallbackData);
            }
          });
          return;
        }
      }
      res.statusCode = 404;
      res.end(`File not found: ${reqPath}`);
    } else {
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

// Start the server and run Puppeteer
server.listen(PORT, async () => {
  console.log(`Temp server running at http://localhost:${PORT}${BASE_PATH}/`);
  
  // Pages we want to print to PDF
  const pagesToPrint = [
    { name: 'cover', path: '/' },
    { name: 'chapter1-section1', path: '/chapter1/section1' },
    { name: 'chapter1-section2', path: '/chapter1/section2' },
  ];

  try {
    console.log('Launching browser via Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const pdfOutputs = [];

    for (const pageInfo of pagesToPrint) {
      const page = await browser.newPage();
      const targetUrl = `http://localhost:${PORT}${BASE_PATH}${pageInfo.path}`;
      
      console.log(`Printing ${pageInfo.name} from: ${targetUrl}`);
      
      // Go to page and wait for network idle to ensure fonts/assets load
      await page.goto(targetUrl, { waitUntil: 'networkidle0' });

      // Create pdf folder if not exists
      const pdfDir = path.join(PROJECT_ROOT, 'dist', 'pdf');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      const outputPath = path.join(pdfDir, `${pageInfo.name}.pdf`);
      
      // Print page using CSS paged media styles
      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      console.log(`Saved PDF to: ${outputPath}`);
      pdfOutputs.push(outputPath);
      await page.close();
    }

    await browser.close();
    console.log('PDF generation completed successfully.');
    
  } catch (error) {
    console.error('Error during PDF generation:', error);
  } finally {
    server.close(() => {
      console.log('Temp server stopped.');
    });
  }
});
