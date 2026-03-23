import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type AuthenticatedRequest, type AuthenticatedRequestUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedRequestUser | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.currentUser;
  },
);
