'use client'

import React from 'react'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { StaticImport } from 'next/dist/shared/lib/get-img-props'
import { UrlObject } from 'url'
import { sidebarLinks } from '@/constants'
import { cn } from '@/lib/utils'
import Footer from './Footer'
import PlaidLink from './PlaidLink'

const MobileNav = ({ user }: MobileNavProps) => {
  const pathname = usePathname()
  return (
    <section className="w-full max-w-[264px]">
      <Sheet>
        <SheetTrigger>
          <Image
            src="/icons/hamburger.svg"
            width={30}
            height={30}
            alt="menu"
            className="cursor-pointer"
          />
        </SheetTrigger>
        <SheetContent side="left" className="border-none bg-white">
          <Link href="/" className=" cursor-pointer flex items-center gap-1 px-4">
            <Image src="/icons/logo.svg" width={34} height={34} alt="Horizon logo" />
            <h1 className="text-26 font-ibm-plex-serif font-bold text-black-1">Horizon</h1>

          </Link>

          <div className="mobilenav-sheet">
            <SheetClose asChild>
              <nav className="flex h-full flex-col gap-6 pt-16">
                {sidebarLinks.map((item: { route: string | UrlObject; label: boolean | React.Key | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | null | undefined; imgURL: string | StaticImport }) => {
                  const isActive = pathname === item.route || pathname.startsWith(`${item.route}/`)

                  return (
                    <SheetClose asChild key={item.route}>
                    <Link href={item.route} key={item.label}
                      className={cn('mobilenac-sheet_close w-full', { 'bg-bank-gradient': isActive })}
                    >
                      
                        <Image
                          src={item.imgURL}
                          alt={item.label}
                          width={20}
                          height={20}
                          className={cn({
                            'brightness-[3] invert-0': isActive
                          })}
                        />
                      
                      <p className={cn("text-16 font-semibold text-black-2 ", { "!text-white": isActive })}>
                        {item.label}
                      </p>
                    </Link>
                    </SheetClose>
                  )
                })}

                <PlaidLink user={user} variant="ghost" />
                
              </nav>
            </SheetClose>
            <Footer user={user}  type="mobile"/>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}

export default MobileNav