import { z } from 'zod';
import { 
  insertUserSchema, 
  insertTextbookSchema, 
  insertAnnotationSchema, 
  insertHelpRequestSchema, 
  insertChatSessionSchema, 
  insertChatMessageSchema,
  insertTutorSessionSchema,
  users,
  textbooks,
  annotations,
  helpRequests,
  chatSessions,
  chatMessages,
  atpTopics,
  diagnosticTests,
  testResults,
  tutorSessions
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.void(),
      },
    },
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  users: {
    update: {
      method: 'PATCH' as const,
      path: '/api/users/:id' as const,
      input: insertUserSchema.partial(),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    listTutors: {
      method: 'GET' as const,
      path: '/api/tutors' as const,
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    approveTutor: {
      method: 'POST' as const,
      path: '/api/users/:id/approve-tutor' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  textbooks: {
    list: {
      method: 'GET' as const,
      path: '/api/textbooks' as const,
      responses: {
        200: z.array(z.custom<typeof textbooks.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/textbooks/:id' as const,
      responses: {
        200: z.custom<typeof textbooks.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/textbooks' as const,
      input: insertTextbookSchema,
      responses: {
        201: z.custom<typeof textbooks.$inferSelect>(),
      },
    },
  },
  annotations: {
    list: {
      method: 'GET' as const,
      path: '/api/annotations' as const, // Query param: textbookId
      responses: {
        200: z.array(z.custom<typeof annotations.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/annotations' as const,
      input: insertAnnotationSchema,
      responses: {
        201: z.custom<typeof annotations.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/annotations/:id' as const,
      responses: {
        204: z.void(),
      },
    },
  },
  helpRequests: {
    create: {
      method: 'POST' as const,
      path: '/api/help-requests' as const,
      input: insertHelpRequestSchema,
      responses: {
        201: z.custom<typeof helpRequests.$inferSelect>(),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/help-requests' as const,
      responses: {
        200: z.array(z.custom<typeof helpRequests.$inferSelect>()),
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/help-requests/:id' as const,
      input: z.object({ status: z.enum(["open", "resolved"]), tutorId: z.number().optional() }),
      responses: {
        200: z.custom<typeof helpRequests.$inferSelect>(),
      },
    },
  },
  atp: {
    list: {
      method: 'GET' as const,
      path: '/api/atp' as const, // Query params: grade, term
      responses: {
        200: z.array(z.custom<typeof atpTopics.$inferSelect>()),
      },
    },
    getTest: {
      method: 'GET' as const,
      path: '/api/atp/tests/:topicId' as const,
      responses: {
        200: z.custom<typeof diagnosticTests.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    submitTest: {
      method: 'POST' as const,
      path: '/api/atp/tests/:testId/submit' as const,
      input: z.object({ answers: z.any(), score: z.number() }),
      responses: {
        201: z.custom<typeof testResults.$inferSelect>(),
      },
    },
  },
  tutorSessions: {
    create: {
      method: 'POST' as const,
      path: '/api/tutor-sessions' as const,
      input: insertTutorSessionSchema,
      responses: {
        201: z.custom<typeof tutorSessions.$inferSelect>(),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/tutor-sessions' as const,
      responses: {
        200: z.array(z.custom<typeof tutorSessions.$inferSelect>()),
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/tutor-sessions/:id' as const,
      input: z.object({ status: z.enum(["requested", "accepted", "completed", "cancelled", "rejected"]), meetingLink: z.string().optional() }),
      responses: {
        200: z.custom<typeof tutorSessions.$inferSelect>(),
      },
    },
  },
  ai: {
    quickQuestion: {
      method: 'POST' as const,
      path: '/api/ai/quick-question' as const,
      input: z.object({ question: z.string(), grade: z.number().optional() }),
      responses: {
        200: z.object({ answer: z.string() }),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
