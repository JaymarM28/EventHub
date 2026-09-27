import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { InternalUsersController } from './internal-users.controller';
import { InternalUserLookupController } from './internal-user-lookup.controller';
import { AdminUsersController } from './admin-users.controller';
import { AuthService } from './auth.service';
import { EmailClientService } from './email-client.service';

@Module({
  imports: [JwtModule.register({}), HttpModule],
  controllers: [
    AuthController,
    InternalUsersController,
    InternalUserLookupController,
    AdminUsersController,
  ],
  providers: [AuthService, EmailClientService],
})
export class AuthModule {}
