import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Create the single-tenant Organization
  const org = await prisma.organization.upsert({
    where: { slug: "dev-org" },
    update: {},
    create: {
      name: "Dev Organization",
      slug: "dev-org",
      billingEmail: "dev@efilo.ai",
    },
  });

  console.log("Organization:", org.name, `(${org.id})`);

  // Create a dev admin user
  const user = await prisma.user.upsert({
    where: { email: "dev@efilo.ai" },
    update: {},
    create: {
      email: "dev@efilo.ai",
      name: "Dev User",
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  console.log("User:", user.name, `(${user.id})`);

  // Create SSO admin user
  const ssoUser = await prisma.user.upsert({
    where: { email: "mnayyar@efilo.ai" },
    update: {},
    create: {
      email: "mnayyar@efilo.ai",
      name: "Mateen Nayyar",
      role: "ADMIN",
      authMethod: "SSO",
      organizationId: org.id,
    },
  });

  console.log("SSO User:", ssoUser.name, `(${ssoUser.id})`);

  // Create a sample project
  const project = await prisma.project.upsert({
    where: { projectCode: "DEV-001" },
    update: {},
    create: {
      projectCode: "DEV-001",
      name: "Sample MEP Project",
      type: "COMMERCIAL",
      contractType: "GMP",
      status: "active",
      organizationId: org.id,
    },
  });

  console.log("Project:", project.name, `(${project.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
