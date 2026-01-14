import * as core from '@actions/core';

import { AIProvider, AIProviderConfig, ReviewRequest, ReviewResponse } from './AIProvider';

import { baseCodeReviewPrompt, updateReviewPrompt } from '../prompts';

export class CustomProvider implements AIProvider {
  private config!: AIProviderConfig;
  private baseUrl!: string;

  async initialize(config: AIProviderConfig): Promise<void> {
    this.config = config;
    this.baseUrl = `${config.baseUrl}`;
  }

  async review(request: ReviewRequest): Promise<ReviewResponse> {
    core.info(`Sending request to custom provider at ${this.baseUrl}`);

    const response = await this.callChatCompletions(request);

    core.debug(`Raw custom provider response: ${JSON.stringify(response, null, 2)}`);

    const parsedResponse = this.parseResponse(response);
    core.info(`Parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    return parsedResponse;
  }

  private async callChatCompletions(request: ReviewRequest): Promise<any> {
    const url = `${this.config.baseUrl}`;

    const body = {
      model: this.config.model.toLowerCase(),
      messages: [
        {
          role: 'system',
          content: this.buildSystemPrompt(request),
        },
        {
          role: 'user',
          content: this.buildPullRequestPrompt(request),
        },
      ],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if API key is provided
    if (this.config.apiKey && this.config.apiKey !== 'none') {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private buildPullRequestPrompt(request: ReviewRequest): string {
    return JSON.stringify({
      type: 'code_review',
      files: request.files,
      pr: request.pullRequest,
      context: request.context,
      previousReviews: request.previousReviews?.map(review => ({
        summary: review.summary,
        lineComments: review.lineComments.map(comment => ({
          path: comment.path,
          line: comment.line,
          comment: comment.comment
        }))
      }))
    });
  }

  private buildSystemPrompt(request: ReviewRequest): string {
    const isUpdate = request.context.isUpdate;
    return `
      ${baseCodeReviewPrompt}
      ${isUpdate ? updateReviewPrompt : ''}
    `;
  }

  private parseResponse(response: any): ReviewResponse {
    let rawContent = response.choices?.[0]?.message?.content ?? '{}';

    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.slice(7, -3);
    }

    // Handle cases where response might be a string
    if (typeof rawContent === 'string') {
      try {
        rawContent = JSON.parse(rawContent);
      } catch {
        // If parsing fails, try to extract JSON from the string
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          rawContent = JSON.parse(jsonMatch[0]);
        }
      }
    }

    const content = typeof rawContent === 'object' ? rawContent : JSON.parse(rawContent as string);

    return {
      summary: content.summary,
      lineComments: content.comments,
      suggestedAction: content.suggestedAction,
      confidence: content.confidence,
    };
  }
}
