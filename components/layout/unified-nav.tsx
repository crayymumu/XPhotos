'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Affix } from 'antd'
import { useTranslations } from 'next-intl'
import Command from '~/components/layout/command'
import { authClient } from '~/lib/auth-client'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '~/lib/utils'
import type { AlbumType } from '~/types'
import { 
  HamburgerMenuIcon,
  Cross1Icon
} from '@radix-ui/react-icons'

interface UnifiedNavProps {
  albums: AlbumType[]
  currentAlbum?: string
  currentTheme?: string
  siteTitle?: string
}

export default function UnifiedNav({
  albums,
  siteTitle = 'XPhotos',
}: UnifiedNavProps) {
  // ========== Hooks ==========
  const pathname = usePathname()
  const t = useTranslations()
  const { data: session } = authClient.useSession()

  // ========== UI State ==========
  const [isNavScrolled, setIsNavScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // ========== Effects ==========
  // 监听页面滚动，更新导航栏样式
  useEffect(() => {
    const handleScroll = () => {
      setIsNavScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 路由变化时自动关闭移动端菜单
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  // ========== Derived Data ==========
  const navLinks = [
    { name: '锚点', href: '/' },
    { name: '不逢春', href: '/covers' },
    { name: '流', href: '/albums' },
    // { name: '关于我', href: '/about' },
    // { name: session ? t('Link.dashboard') : t('Login.signIn'), href: session ? '/admin' : '/login' },
  ]

  // 过滤出需要在菜单中展示的相册
  const visibleAlbums = albums.filter((album) => album.album_value !== '/' && album.show === 0)

  // ========== Helpers ==========
  // 判断当前路由是否激活
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  // 切换移动端菜单状态
  const toggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev)

  // 关闭移动端菜单
  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <>
      <Affix offsetTop={0}>
        <nav
          className={cn(
            'w-full h-[60px] fixed top-0 left-0 z-50 transition-all duration-300',
            'backdrop-blur-[12px] bg-[#1a1a1a]/15 border-b border-transparent',
            isNavScrolled && 'border-b-[1px] border-white/10 shadow-lg'
          )}
          style={{
            borderBottom: isNavScrolled ? 'linear-gradient(to right, #2B4B6F, #8ECFC9) 1' : 'none'
          }}
        >
          <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0 group">
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#2B4B6F] to-[#8ECFC9] tracking-tight group-hover:opacity-80 transition-opacity">
                {siteTitle}
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative group py-2"
                >
                  <span 
                    className={cn(
                      'text-[16px] transition-all duration-300 block',
                      isActive(link.href) 
                        ? 'bg-clip-text text-transparent bg-gradient-to-r from-[#2B4B6F] to-[#8ECFC9] font-medium'
                        : 'text-[#e0e0e0] group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#2B4B6F] group-hover:to-[#8ECFC9] group-hover:translate-x-[5px]'
                    )}
                  >
                    {link.name}
                  </span>
                  {isActive(link.href) && (
                    <motion.div
                      layoutId="underline"
                      className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#2B4B6F] to-[#8ECFC9]"
                    />
                  )}
                </Link>
              ))}
            </div>

            {/* Mobile Menu Toggle */}
            <div className="md:hidden flex items-center">
              <button
                onClick={toggleMobileMenu}
                className="p-2 text-[#e0e0e0] hover:text-white transition-colors"
              >
                {isMobileMenuOpen ? <Cross1Icon className="w-6 h-6" /> : <HamburgerMenuIcon className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </nav>
      </Affix>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[#0f172a]/95 backdrop-blur-xl pt-[80px] px-6 md:hidden overflow-y-auto"
          >
              <div className="flex flex-col space-y-6 pb-10">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-2xl font-medium text-gray-200 hover:text-white"
                  onClick={closeMobileMenu}
                >
                  {link.name}
                </Link>
              ))}
              
              <div className="text-sm text-gray-500 uppercase tracking-wider mt-4">相册</div>
              <div className="grid grid-cols-2 gap-4">
                {visibleAlbums.map(album => (
                  <Link
                    key={album.id}
                    href={album.album_value}
                    className="text-lg text-gray-300 hover:text-white"
                    onClick={closeMobileMenu}
                  >
                    {album.name}
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Command data={albums} />
    </>
  )
}
