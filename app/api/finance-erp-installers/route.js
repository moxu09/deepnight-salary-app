import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeErpRequest } from '@/lib/erpAccess';
import { createFinanceInstallerHandler } from '@/lib/financeErpInstallers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=createFinanceInstallerHandler({storage:supabaseAdmin.storage,
  authorize:request=>authorizeErpRequest(supabaseAdmin,request,'deepnight')});
