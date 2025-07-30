// GitLab AI Code Reviewer
// A Node.js application that automatically reviews GitLab merge requests using AI

// Required packages
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { createLogger, format, transports } = require('winston');

// Load environment variables
dotenv.config();

// Configure logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'ai-reviewer.log' })
  ]
});

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Add request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT, () => {
    logger.error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
    res.status(408).send('Request Timeout');
  });
  next();
});

// Initialize AI clients based on the configured model
let openai = null;
let anthropic = null;

// Initialize OpenAI client if using GPT models
if (AI_MODEL.startsWith('gpt')) {
  if (!process.env.OPENAI_API_KEY) {
    logger.error('OPENAI_API_KEY is required when using GPT models');
    process.exit(1);
  }
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  logger.info('OpenAI client initialized');
}

// Initialize Anthropic client if using Claude models
if (AI_MODEL.startsWith('claude')) {
  try {
    const { Anthropic } = require('@anthropic-ai/sdk');
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.error('ANTHROPIC_API_KEY is required when using Claude models');
      process.exit(1);
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    logger.info('Anthropic client initialized');
  } catch (error) {
    logger.error('Failed to initialize Anthropic client. Make sure @anthropic-ai/sdk is installed:', error.message);
    process.exit(1);
  }
}


// GitLab configuration
const GITLAB_URL = process.env.GITLAB_URL || 'https://gitlab.com/api/v4';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

// AI model configuration
const AI_MODEL = process.env.AI_MODEL || 'gpt-4';  // Can also use 'claude-3-sonnet-20240229' if using Anthropic

// Webhook secret token for verification
const EXPECTED_TOKEN = process.env.EXPECTED_GITLAB_TOKEN;

// Timeout configurations
const GITLAB_API_TIMEOUT = parseInt(process.env.GITLAB_API_TIMEOUT) || 30000; // 30 seconds
const AI_API_TIMEOUT = parseInt(process.env.AI_API_TIMEOUT) || 120000; // 2 minutes
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT) || 300000; // 5 minutes for webhook processing

// Create axios instance with timeout for GitLab API calls
const gitlabAxios = axios.create({
  timeout: GITLAB_API_TIMEOUT,
  headers: {
    'PRIVATE-TOKEN': GITLAB_TOKEN
  }
});

// Function to get merge request changes from GitLab
async function getMergeRequestChanges(projectId, mergeRequestId) {
  try {
    const response = await gitlabAxios.get(
      `${GITLAB_URL}/projects/${projectId}/merge_requests/${mergeRequestId}/changes`
    );
    
    if (response.status === 200) {
      return response.data.changes;
    } else {
      logger.error(`Failed to fetch merge request changes: ${response.status}`);
      return [];
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      logger.error(`Timeout fetching merge request changes after ${GITLAB_API_TIMEOUT}ms`);
    } else {
      logger.error('Error fetching merge request changes:', error.message);
    }
    return [];
  }
}

// Function to get merge request details
async function getMergeRequestDetails(projectId, mergeRequestId) {
  try {
    const response = await gitlabAxios.get(
      `${GITLAB_URL}/projects/${projectId}/merge_requests/${mergeRequestId}`
    );
    
    if (response.status === 200) {
      return response.data;
    } else {
      logger.error(`Failed to fetch merge request details: ${response.status}`);
      return null;
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      logger.error(`Timeout fetching merge request details after ${GITLAB_API_TIMEOUT}ms`);
    } else {
      logger.error('Error fetching merge request details:', error.message);
    }
    return null;
  }
}

// Function to analyze code with OpenAI
async function analyzeCodeWithOpenAI(codeChanges, mergeRequestDetails) {
  if (!openai) {
    throw new Error('OpenAI client not initialized');
  }

  // Create a prompt with the code changes and context
  const prompt = `
  You are an expert code reviewer analyzing a GitLab merge request. 
  Please review the following code changes and provide feedback.
  
  Merge Request Title: ${mergeRequestDetails.title}
  Description: ${mergeRequestDetails.description || 'No description provided'}
  
  Focus on:
  1. Code quality issues
  2. Potential bugs or errors
  3. Security vulnerabilities
  4. Performance concerns
  5. Adherence to best practices
  
  For each issue, categorize it as:
  - Critical: Must be fixed before merging
  - Important: Should be addressed but not blocking
  - Suggestion: Optional improvements
  
  Changed files:
  ${codeChanges.map(change => `
  --- ${change.old_path} → ${change.new_path} ---
  ${change.diff}
  `).join('\n')}
  
  Provide your review in Markdown format. Be specific about line numbers when possible.
  `;

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI API request timeout')), AI_API_TIMEOUT);
    });

    const apiPromise = openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "You are an expert code reviewer who provides helpful, thorough, and actionable feedback." },
        { role: "user", content: prompt }
      ],
      max_tokens: 4000,
      temperature: 0.2,
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    return response.choices[0].message.content;
  } catch (error) {
    if (error.message === 'AI API request timeout') {
      logger.error(`OpenAI API request timeout after ${AI_API_TIMEOUT}ms`);
    } else {
      logger.error('Error analyzing code with AI:', error.message);
    }
    return "Error analyzing code. Please check the logs for more information.";
  }
}

// Function to analyze code with Anthropic (Claude)
async function analyzeCodeWithAnthropic(codeChanges, mergeRequestDetails) {
  if (!anthropic) {
    throw new Error('Anthropic client not initialized');
  }
  
  const prompt = `
  You are an expert code reviewer analyzing a GitLab merge request. 
  Please review the following code changes and provide feedback.
  
  Merge Request Title: ${mergeRequestDetails.title}
  Description: ${mergeRequestDetails.description || 'No description provided'}
  
  Focus on:
  1. Code quality issues
  2. Potential bugs or errors
  3. Security vulnerabilities
  4. Performance concerns
  5. Adherence to best practices
  
  For each issue, categorize it as:
  - Critical: Must be fixed before merging
  - Important: Should be addressed but not blocking
  - Suggestion: Optional improvements
  
  Changed files:
  ${codeChanges.map(change => `
  --- ${change.old_path} → ${change.new_path} ---
  ${change.diff}
  `).join('\n')}
  
  Provide your review in Markdown format. Be specific about line numbers when possible.
  `;

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI API request timeout')), AI_API_TIMEOUT);
    });

    const apiPromise = anthropic.messages.create({
      model: AI_MODEL.startsWith('claude') ? AI_MODEL : 'claude-3-sonnet-20240229',
      max_tokens: 4000,
      temperature: 0.2,
      system: "You are an expert code reviewer who provides helpful, thorough, and actionable feedback.",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    return response.content[0].text;
  } catch (error) {
    if (error.message === 'AI API request timeout') {
      logger.error(`Anthropic API request timeout after ${AI_API_TIMEOUT}ms`);
    } else {
      logger.error('Error analyzing code with Claude:', error.message);
    }
    return "Error analyzing code. Please check the logs for more information.";
  }
}

// Function to post review comment on merge request
async function postReviewComment(projectId, mergeRequestId, reviewContent) {
  try {
    const response = await gitlabAxios.post(
      `${GITLAB_URL}/projects/${projectId}/merge_requests/${mergeRequestId}/notes`,
      {
        body: reviewContent
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.status === 201) {
      logger.info(`Successfully posted review comment on MR #${mergeRequestId}`);
      return true;
    } else {
      logger.error(`Failed to post review comment: ${response.status}`);
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      logger.error(`Timeout posting review comment after ${GITLAB_API_TIMEOUT}ms`);
    } else {
      logger.error('Error posting review comment:', error.message);
    }
    return false;
  }
}

// Webhook endpoint for GitLab merge request events
app.post('/webhook/merge-request', async (req, res) => {
  // Verify webhook token
  const token = req.headers['x-gitlab-token'];
  if (token !== EXPECTED_TOKEN) {
    logger.warn('Invalid webhook token');
    return res.status(401).send('Unauthorized');
  }
  
  const event = req.body;
  
  // Check if this is a merge request event
  if (event.object_kind !== 'merge_request') {
    return res.status(200).send('Not a merge request event');
  }
  
  // Check for merge request actions we want to review (opened or updated)
  const validActions = ['open', 'update', 'reopen'];
  if (!validActions.includes(event.object_attributes.action)) {
    return res.status(200).send(`Ignoring merge request action: ${event.object_attributes.action}`);
  }
  
  const projectId = event.project.id;
  const mergeRequestId = event.object_attributes.iid;
  
  logger.info(`Processing merge request #${mergeRequestId} in project ${projectId}`);
  
  try {
    // Get merge request changes
    const changes = await getMergeRequestChanges(projectId, mergeRequestId);
    if (!changes || changes.length === 0) {
      logger.warn('No changes found in merge request');
      return res.status(200).send('No changes to review');
    }
    
    // Get merge request details
    const mergeRequestDetails = await getMergeRequestDetails(projectId, mergeRequestId);
    if (!mergeRequestDetails) {
      logger.error('Failed to get merge request details');
      return res.status(500).send('Failed to get merge request details');
    }
    
    // Analyze code with AI
    let reviewContent;
    try {
      if (AI_MODEL.startsWith('gpt')) {
        reviewContent = await analyzeCodeWithOpenAI(changes, mergeRequestDetails);
      } else if (AI_MODEL.startsWith('claude')) {
        reviewContent = await analyzeCodeWithAnthropic(changes, mergeRequestDetails);
      } else {
        logger.warn(`Unsupported AI model: ${AI_MODEL}, falling back to Claude`);
        reviewContent = await analyzeCodeWithAnthropic(changes, mergeRequestDetails);
      }
    } catch (error) {
      logger.error(`Error analyzing code: ${error.message}`);
      reviewContent = "Error analyzing code. Please check the logs for more information.";
    }
    
    // Add header to the review content
    const reviewWithHeader = `## AI Code Review Bot 🤖\n\n${reviewContent}`;
    
    // Post review as a comment on the merge request
    const success = await postReviewComment(projectId, mergeRequestId, reviewWithHeader);
    if (success) {
      return res.status(200).send('Review completed and posted successfully');
    } else {
      return res.status(500).send('Failed to post review comment');
    }
  } catch (error) {
    logger.error('Error processing merge request:', error.message);
    return res.status(500).send('Internal server error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Using AI model: ${AI_MODEL}`);
});

// Export app for testing
module.exports = app;