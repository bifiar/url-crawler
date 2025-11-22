import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class SubmitFetchDto {
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMinSize(1)
  urls: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxDepth?: number;
}
