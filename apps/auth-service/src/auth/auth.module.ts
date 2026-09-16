import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { InternalUsersController } from './internal-users.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, InternalUsersController],
  providers: [AuthService],
})
export class AuthModule {}
