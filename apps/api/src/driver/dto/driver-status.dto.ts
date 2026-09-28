import { IsBoolean } from 'class-validator';

export class DriverStatusDto {
  @IsBoolean()
  online: boolean;
}
