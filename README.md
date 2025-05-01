# GitLab AI Code Reviewer

An automated AI-powered code review system for GitLab merge requests. This tool integrates with GitLab's webhook system to automatically analyze code changes in merge requests and provide intelligent feedback.

## Features

- **Automated Code Reviews**: Automatically triggered when merge requests are opened or updated
- **Comprehensive Analysis**: Reviews code for quality issues, bugs, security vulnerabilities, and best practices
- **Flexible AI Models**: Support for multiple AI models including OpenAI GPT and Anthropic Claude
- **Markdown Formatting**: Reviews are posted as well-formatted comments directly on merge requests
- **Easy Deployment**: Docker support for simple deployment in any environment

## How It Works

1. The application sets up a webhook endpoint that listens for GitLab merge request events
2. When a merge request is opened or updated, GitLab sends an event to the webhook
3. The application fetches the code changes from the GitLab API
4. The code changes are analyzed using the configured AI model
5. A detailed review is posted as a comment on the merge request

## Prerequisites

- Node.js 18+ (if running directly)
- Docker (if using containerized deployment)
- GitLab instance with API access
- API key for OpenAI or Anthropic (depending on chosen model)

## Installation

### Local Installation

1. Clone this repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Create a `.env` file with your configuration (see `.env.example`)
4. Start the application:
   ```
   pnpm start
   ```

### Docker Installation

1. Build the Docker image:
   ```
   docker build -t gitlab-ai-reviewer .
   ```
2. Run the container:
   ```
   docker run -p 3000:3000 --env-file .env gitlab-ai-reviewer
   ```

## Configuration

Create a `.env` file with the following variables:

```
GITLAB_URL=https://gitlab.com/api/v4
GITLAB_TOKEN=your_gitlab_personal_access_token
EXPECTED_GITLAB_TOKEN=your_gitlab_webhook_secret_token
AI_MODEL=gpt-4
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key (if using Claude)
PORT=3000
```

### GitLab Setup

1. Create a Personal Access Token in GitLab with `api` scope
2. Set up a webhook in your GitLab project:
   - URL: `http://your-server:3000/webhook/merge-request`
   - Secret Token: Same as `EXPECTED_GITLAB_TOKEN`
   - Trigger: Merge request events

## AI Model Selection

The system supports the following AI models:

- OpenAI models: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`
- Anthropic models: `claude-3-sonnet-20240229`, `claude-3-5-sonnet-20240620`

Set your preferred model in the `.env` file with the `AI_MODEL` variable.

## Customization

You can customize the code review process by modifying the prompt in the `analyzeCodeWithOpenAI` or `analyzeCodeWithAnthropic` functions. The prompts determine what aspects of the code the AI focuses on and how the feedback is structured.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
