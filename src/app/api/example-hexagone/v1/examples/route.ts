import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { CreateExampleDtoSchema } from "@/example-hexagone/application/dto/create-example.dto";
import { createExampleUseCase } from "@/example-hexagone/example.module";

export const POST = apiHandler(async (req: Request) => {
  const body = CreateExampleDtoSchema.parse(await req.json());
  const example = await createExampleUseCase.execute(body);
  return NextResponse.json(example, { status: 201 });
});
