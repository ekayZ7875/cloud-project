/**
 * Generates a beautiful, responsive HTML template for share notification emails.
 *
 * @param {Object} params
 * @param {string} params.ownerName - Name or email of the person who shared the file.
 * @param {string} params.fileName - Name of the file.
 * @param {string} params.permission - Permission level (VIEW, COMMENT, EDIT).
 * @param {string} params.dashboardUrl - The link to open the shared dashboard.
 * @returns {string} The formatted HTML string.
 */
export function getShareNotificationHtml({ ownerName, fileName, permission, dashboardUrl }) {
  const safeOwner = ownerName || "Someone";
  const safeFile = fileName || "a file";
  
  // Format permission badges
  let permissionColor = "#3b82f6"; // default blue (VIEW)
  if (permission === "EDIT") {
    permissionColor = "#10b981"; // green
  } else if (permission === "COMMENT") {
    permissionColor = "#f59e0b"; // amber
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>File Shared with You</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f3f4f6;
      padding: 40px 0;
    }
    .content-card {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
      border: 1px solid #e5e7eb;
      overflow: hidden;
    }
    .header-banner {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .header-banner h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .body-content {
      padding: 32px 32px 24px 32px;
      color: #1f2937;
    }
    .greeting {
      font-size: 16px;
      line-height: 24px;
      margin-bottom: 20px;
    }
    .highlight-box {
      background-color: #f9fafb;
      border: 1px solid #f3f4f6;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .detail-row {
      margin-bottom: 12px;
      font-size: 15px;
      line-height: 20px;
    }
    .detail-row:last-child {
      margin-bottom: 0;
    }
    .detail-label {
      color: #6b7280;
      font-weight: 500;
      width: 110px;
      display: inline-block;
    }
    .detail-value {
      color: #111827;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
      border-radius: 6px;
      color: #ffffff;
      text-transform: uppercase;
    }
    .cta-container {
      text-align: center;
      margin: 32px 0 16px 0;
    }
    .cta-button {
      background-color: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      font-weight: 600;
      font-size: 15px;
      border-radius: 10px;
      display: inline-block;
      transition: background-color 0.2s ease;
      box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2), 0 2px 4px -1px rgba(79, 70, 229, 0.10);
    }
    .cta-button:hover {
      background-color: #4338ca;
    }
    .footer {
      padding: 24px 32px 32px 32px;
      border-top: 1px solid #f3f4f6;
      text-align: center;
      font-size: 12px;
      line-height: 18px;
      color: #9ca3af;
      background-color: #fafafa;
    }
    .footer a {
      color: #6366f1;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="content-card">
      <!-- Header Banner -->
      <div class="header-banner">
        <h1>Document Collaboration</h1>
      </div>
      
      <!-- Body -->
      <div class="body-content">
        <p class="greeting">Hello,</p>
        <p class="greeting"><strong>${safeOwner}</strong> has shared a document with you on Chunkly. You now have access to collaborate on this file.</p>
        
        <!-- Highlight Box -->
        <div class="highlight-box">
          <div class="detail-row">
            <span class="detail-label">File Name:</span>
            <span class="detail-value">${safeFile}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Shared By:</span>
            <span class="detail-value">${safeOwner}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Permission:</span>
            <span class="badge" style="background-color: ${permissionColor};">${permission}</span>
          </div>
        </div>
        
        <!-- Action Button -->
        <div class="cta-container">
          <a href="${dashboardUrl}" class="cta-button" target="_blank">Access Shared File</a>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p>If you did not expect to receive this file, you can safely ignore this email.</p>
        <p>&copy; ${new Date().getFullYear()} Chunkly Inc. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
