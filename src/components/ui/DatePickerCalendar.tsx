'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addMonths,
    subMonths,
    eachDayOfInterval,
    isSameDay,
    isSameMonth,
    isToday,
} from 'date-fns'

interface DatePickerCalendarProps {
    selectedDate: Date | null
    onChange: (date: Date | null) => void
    placeholder?: string
}

export default function DatePickerCalendar({ selectedDate, onChange, placeholder = 'Pick a date' }: DatePickerCalendarProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date())
    const containerRef = useRef<HTMLDivElement>(null)

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

    const handleSelect = (day: Date) => {
        onChange(day)
        setIsOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation()
        onChange(null)
        setIsOpen(false)
    }

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:border-blue-500 transition-colors min-w-[180px]"
            >
                <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className={selectedDate ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : placeholder}
                </span>
                {selectedDate && (
                    <X
                        className="w-4 h-4 text-muted-foreground hover:text-red-400 ml-auto flex-shrink-0 transition-colors"
                        onClick={handleClear}
                    />
                )}
            </button>

            {/* Calendar dropdown */}
            {isOpen && (
                <div className="absolute top-full mt-2 left-0 z-50 bg-card border border-border rounded-xl shadow-2xl p-4 w-[300px] animate-in fade-in-0 zoom-in-95">
                    {/* Header — month navigation */}
                    <div className="flex items-center justify-between mb-3">
                        <button
                            type="button"
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <span className="text-sm font-semibold text-foreground">
                            {format(currentMonth, 'MMMM yyyy')}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                        >
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 mb-1">
                        {weekDays.map(d => (
                            <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Day grid */}
                    <div className="grid grid-cols-7 gap-0.5">
                        {days.map((day, i) => {
                            const inMonth = isSameMonth(day, currentMonth)
                            const selected = selectedDate && isSameDay(day, selectedDate)
                            const today = isToday(day)

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleSelect(day)}
                                    className={`
                                        w-9 h-9 rounded-lg text-sm font-medium flex items-center justify-center transition-all
                                        ${!inMonth ? 'text-muted-foreground/40' : 'text-foreground'}
                                        ${selected
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                                            : today
                                                ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'
                                                : 'hover:bg-secondary'
                                        }
                                    `}
                                >
                                    {format(day, 'd')}
                                </button>
                            )
                        })}
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <button
                            type="button"
                            onClick={() => handleSelect(new Date())}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                        >
                            Today
                        </button>
                        {selectedDate && (
                            <button
                                type="button"
                                onClick={handleClear}
                                className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
