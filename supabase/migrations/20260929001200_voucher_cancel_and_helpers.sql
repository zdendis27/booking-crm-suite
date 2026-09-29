create function public.cancel_voucher(p_voucher uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_voucher public.vouchers;
begin
  select * into v_voucher from public.vouchers where id = p_voucher for update;
  if not found or not public.has_salon_role(v_voucher.salon_id, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_voucher.status <> 'active' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.vouchers set status = 'cancelled' where id = p_voucher;
  insert into public.voucher_transactions (salon_id, voucher_id, kind, amount, created_by)
  values (v_voucher.salon_id, p_voucher, 'adjust', -v_voucher.balance, auth.uid());
  perform public.write_audit(v_voucher.salon_id, 'voucher.cancel', 'voucher', p_voucher, null, jsonb_build_object('balance', v_voucher.balance));
end
$$;

revoke execute on function public.cancel_voucher(uuid) from public, anon;
