import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Only these three fields are accepted. Anything else (e.g. "role": "DRIVER")
// is rejected by the global ValidationPipe, so nobody can sign up as a driver.
export class SignupDto {
  // Fits users.name, varchar(80).
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  // bcrypt only uses the first 72 bytes of a password, so longer ones are refused.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
