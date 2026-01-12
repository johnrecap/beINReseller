interface ChartData {
    date: string
    total: number
    completed: number
    failed: number
}

export default function OperationsChart({ data }: { data: ChartData[] }) {
    const maxVal = Math.max(...data.map(d => d.total), 1)

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">إحصائيات العمليات (7 أيام)</h3>

            <div className="h-64 flex items-end justify-between gap-2">
                {data.map((item, i) => {
                    const heightPercent = (item.total / maxVal) * 100
                    const successHeight = item.total > 0 ? (item.completed / item.total) * 100 : 0

                    return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                            {/* Tooltip */}
                            <div className="opacity-0 group-hover:opacity-100 absolute -mt-12 bg-gray-900 text-white text-xs p-2 rounded transition-opacity whitespace-nowrap z-10">
                                {item.date}: {item.completed} ✅ / {item.failed} ❌
                            </div>

                            {/* Bar Container */}
                            <div
                                className="w-full max-w-[40px] bg-red-100 rounded-t-lg relative overflow-hidden transition-all duration-500"
                                style={{ height: `${heightPercent}%` }}
                            >
                                {/* Success Portion */}
                                <div
                                    className="absolute bottom-0 left-0 w-full bg-green-500 transition-all duration-500"
                                    style={{ height: `${successHeight}%` }}
                                />
                            </div>

                            {/* Label */}
                            <span className="text-xs text-gray-500 font-medium">{item.date}</span>
                        </div>
                    )
                })}
            </div>

            <div className="flex justify-center gap-6 mt-6 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">ناجحة</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-100 rounded-full"></div>
                    <span className="text-gray-600">فاشلة</span>
                </div>
            </div>
        </div>
    )
}
