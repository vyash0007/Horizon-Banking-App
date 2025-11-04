"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "./ui/button";
import {
  cn,
  formUrlQuery,
  formatAmount,
  getAccountTypeColors,
} from "@/lib/utils";
import { AccountTypes, BankInfoProps } from "@/types";

const BankInfo = ({ account, appwriteItemId, type, onReauth }: BankInfoProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isActive = appwriteItemId === account?.appwriteItemId;
  const needsReauth = account?.needsReauth;

  const handleBankChange = () => {
    const newUrl = formUrlQuery({
      params: searchParams.toString(),
      key: "id",
      value: account?.appwriteItemId,
    });
    router.push(newUrl, { scroll: false });
  };

  const colors = getAccountTypeColors(account?.type as AccountTypes);

  const handleReauthClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReauth && account) {
      onReauth(account);
    }
  };

  return (
    <div className={cn(`bank-info ${colors.bg}`, {
      "shadow-sm border-blue-700": type === "card" && isActive,
      "rounded-xl": type === "card",
      "hover:shadow-sm cursor-pointer": type === "card",
    })}>
      <div onClick={handleBankChange} className="flex items-center gap-[18px]">
        <figure className={`flex-center h-fit rounded-full bg-blue-100 ${colors.lightBg}`}>
          <Image
            src={needsReauth ? "/icons/warning.svg" : "/icons/connect-bank.svg"}
            width={20}
            height={20}
            alt={account.subtype}
            className="m-2 min-w-5"
          />
        </figure>
        <div className="flex w-full flex-1 flex-col justify-center gap-1">
          <div className="bank-info_content">
            <h2 className={`text-16 line-clamp-1 flex-1 font-bold text-blue-900 ${colors.title}`}>
              {account.name}
            </h2>
            {type === "full" && (
              <p className={`text-12 rounded-full px-3 py-1 font-medium text-blue-700 ${colors.subText} ${colors.lightBg}`}>
                {needsReauth ? "Needs Reauthorization" : account.subtype}
              </p>
            )}
          </div>
          <p className={`text-16 font-medium text-blue-700 ${colors.subText}`}>
            {needsReauth ? "Please reconnect your bank" : formatAmount(account.currentBalance)}
          </p>
        </div>
      </div>
      {needsReauth && (
        <div className="mt-4">
          <Button
            onClick={handleReauthClick}
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Reconnect Bank Account
          </Button>
        </div>
      )}
    </div>
  );
};

export default BankInfo;