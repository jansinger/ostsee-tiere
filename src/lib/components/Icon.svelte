<script lang="ts">
	// Import all icons we use in the project
	import type { Component } from 'svelte';
	import Activity from '~icons/lucide/activity';
	import AlertCircle from '~icons/lucide/alert-circle';
	import Anchor from '~icons/lucide/anchor';
	import Archive from '~icons/lucide/archive';
	import ArrowLeft from '~icons/lucide/arrow-left';
	import Baby from '~icons/lucide/baby';
	import BarChart from '~icons/lucide/bar-chart';
	import Binoculars from '~icons/lucide/binoculars';
	import BookOpen from '~icons/lucide/book-open';
	import Braces from '~icons/lucide/braces';
	import Calendar from '~icons/lucide/calendar';
	import Camera from '~icons/lucide/camera';
	import Car from '~icons/lucide/car';
	import ChartPie from '~icons/lucide/chart-pie';
	import Check from '~icons/lucide/check';
	import CheckCircle from '~icons/lucide/check-circle';
	import ChevronDown from '~icons/lucide/chevron-down';
	import ChevronRight from '~icons/lucide/chevron-right';
	import ChevronUp from '~icons/lucide/chevron-up';
	import CircleAlert from '~icons/lucide/circle-alert';
	import CircleCheck from '~icons/lucide/circle-check';
	import CircleHelp from '~icons/lucide/circle-help';
	import CircleX from '~icons/lucide/circle-x';
	import Clock from '~icons/lucide/clock';
	import Cloud from '~icons/lucide/cloud';
	import CloudRain from '~icons/lucide/cloud-rain';
	import Columns from '~icons/lucide/columns';
	import Crosshair from '~icons/lucide/crosshair';
	import Download from '~icons/lucide/download';
	import Eye from '~icons/lucide/eye';
	import File from '~icons/lucide/file';
	import FileCode from '~icons/lucide/file-code';
	import FileSearch from '~icons/lucide/file-search';
	import FileText from '~icons/lucide/file-text';
	import FileType from '~icons/lucide/file-type';
	import Filter from '~icons/lucide/filter';
	import Fish from '~icons/lucide/fish';
	import Gauge from '~icons/lucide/gauge';
	import Gem from '~icons/lucide/gem';
	import Github from '~icons/lucide/github';
	import Globe from '~icons/lucide/globe';
	import HardDrive from '~icons/lucide/hard-drive';
	import Hash from '~icons/lucide/hash';
	import Heart from '~icons/lucide/heart';
	import Home from '~icons/lucide/home';
	import Image from '~icons/lucide/image';
	import Images from '~icons/lucide/images';
	import Info from '~icons/lucide/info';
	import List from '~icons/lucide/list';
	import Loader2 from '~icons/lucide/loader-2';
	import LoaderPinwheel from '~icons/lucide/loader-pinwheel';
	import Lock from '~icons/lucide/lock';
	import LogOut from '~icons/lucide/log-out';
	import Mail from '~icons/lucide/mail';
	import Map from '~icons/lucide/map';
	import MapPin from '~icons/lucide/map-pin';
	import MessageCircle from '~icons/lucide/message-circle';
	import MessageSquare from '~icons/lucide/message-square';
	import Mountain from '~icons/lucide/mountain';
	import MousePointer from '~icons/lucide/mouse-pointer';
	import Move from '~icons/lucide/move';
	import Music from '~icons/lucide/music';
	import Navigation from '~icons/lucide/navigation';
	import Navigation2 from '~icons/lucide/navigation-2';
	import PenLine from '~icons/lucide/pen-line';
	import PenOff from '~icons/lucide/pen-off';
	import Phone from '~icons/lucide/phone';
	import Play from '~icons/lucide/play';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import Database from '~icons/lucide/database';
	import GitCompareArrows from '~icons/lucide/git-compare-arrows';
	import MapPinOff from '~icons/lucide/map-pin-off';
	import RotateCcw from '~icons/lucide/rotate-ccw';
	import ZoomIn from '~icons/lucide/zoom-in';
	import SearchX from '~icons/lucide/search-x';
	import WifiOff from '~icons/lucide/wifi-off';
	import Save from '~icons/lucide/save';
	import Scale from '~icons/lucide/scale';
	import Send from '~icons/lucide/send';
	import Settings from '~icons/lucide/settings';
	import ShieldAlert from '~icons/lucide/shield-alert';
	import ShieldCheck from '~icons/lucide/shield-check';
	import Ship from '~icons/lucide/ship';
	import SkipForward from '~icons/lucide/skip-forward';
	import Skull from '~icons/lucide/skull';
	import Smartphone from '~icons/lucide/smartphone';
	import SquarePen from '~icons/lucide/square-pen';
	import SquareX from '~icons/lucide/square-x';
	import Thermometer from '~icons/lucide/thermometer';
	import ToggleLeft from '~icons/lucide/toggle-left';
	import Trash2 from '~icons/lucide/trash-2';
	import TrendingUp from '~icons/lucide/trending-up';
	import TriangleAlert from '~icons/lucide/triangle-alert';
	import Upload from '~icons/lucide/upload';
	import User from '~icons/lucide/user';
	import UserCheck from '~icons/lucide/user-check';
	import Users from '~icons/lucide/users';
	import Video from '~icons/lucide/video';
	import Waves from '~icons/lucide/waves';
	import Wind from '~icons/lucide/wind';
	import X from '~icons/lucide/x';
	import Zap from '~icons/lucide/zap';

	// Icon map for dynamic icon lookup

	const iconMap: Record<string, Component> = {
		'lucide:map-pin': MapPin,
		'lucide:calendar': Calendar,
		'lucide:wind': Wind,
		'lucide:cloud': Cloud,
		'lucide:mail': Mail,
		'lucide:eye': Eye,
		'lucide:trash-2': Trash2,
		'lucide:settings': Settings,
		'lucide:alert-circle': AlertCircle,
		'lucide:check': Check,
		'lucide:x': X,
		'lucide:chevron-down': ChevronDown,
		'lucide:chevron-right': ChevronRight,
		'lucide:chevron-up': ChevronUp,
		'lucide:filter': Filter,
		'lucide:download': Download,
		'lucide:columns': Columns,
		'lucide:crosshair': Crosshair,
		'lucide:user': User,
		'lucide:log-out': LogOut,
		'lucide:github': Github,
		'lucide:upload': Upload,
		'lucide:loader-2': Loader2,
		'lucide:info': Info,
		'lucide:shield-alert': ShieldAlert,
		'lucide:waves': Waves,
		'lucide:activity': Activity,
		'lucide:camera': Camera,
		'lucide:thermometer': Thermometer,
		'lucide:gauge': Gauge,
		'lucide:binoculars': Binoculars,
		'lucide:skip-forward': SkipForward,
		'lucide:anchor': Anchor,
		'lucide:message-square': MessageSquare,
		'lucide:save': Save,
		'lucide:arrow-left': ArrowLeft,
		'lucide:play': Play,
		'lucide:file-text': FileText,
		'lucide:image': Image,
		'lucide:images': Images,
		'lucide:video': Video,
		'lucide:circle-alert': CircleAlert,
		'lucide:circle-check': CircleCheck,
		'lucide:circle-x': CircleX,
		'lucide:square-x': SquareX,
		'lucide:list': List,
		'lucide:triangle-alert': TriangleAlert,
		'lucide:square-pen': SquarePen,
		'lucide:pen-line': PenLine,
		'lucide:pen-off': PenOff,
		'lucide:chart-pie': ChartPie,
		'lucide:trending-up': TrendingUp,
		'lucide:users': Users,
		'lucide:circle-help': CircleHelp,
		'lucide:music': Music,
		'lucide:archive': Archive,
		'lucide:file': File,
		'lucide:refresh-cw': RefreshCw,
		'lucide:database': Database,
		'lucide:git-compare-arrows': GitCompareArrows,
		'lucide:map-pin-off': MapPinOff,
		'lucide:rotate-ccw': RotateCcw,
		'lucide:zoom-in': ZoomIn,
		'lucide:search-x': SearchX,
		'lucide:wifi-off': WifiOff,
		'lucide:home': Home,
		'lucide:file-search': FileSearch,
		'lucide:lock': Lock,
		'lucide:check-circle': CheckCircle,
		'lucide:baby': Baby,
		'lucide:car': Car,
		'lucide:clock': Clock,
		'lucide:cloud-rain': CloudRain,
		'lucide:hash': Hash,
		'lucide:fish': Fish,
		'lucide:globe': Globe,
		'lucide:message-circle': MessageCircle,
		'lucide:mouse-pointer': MousePointer,
		'lucide:move': Move,
		'lucide:navigation': Navigation,
		'lucide:navigation-2': Navigation2,
		'lucide:phone': Phone,
		'lucide:shield-check': ShieldCheck,
		'lucide:ship': Ship,
		'lucide:skull': Skull,
		'lucide:toggle-left': ToggleLeft,
		'lucide:user-check': UserCheck,
		'lucide:zap': Zap,
		'lucide:mountain': Mountain,
		'lucide:book-open': BookOpen,
		'lucide:map': Map,
		'lucide:heart': Heart,
		'lucide:scale': Scale,
		'lucide:send': Send,
		'lucide:smartphone': Smartphone,
		'lucide:gem': Gem,
		'lucide:loader-pinwheel': LoaderPinwheel,
		'lucide:file-type': FileType,
		'lucide:hard-drive': HardDrive,
		'lucide:bar-chart': BarChart,
		'lucide:braces': Braces,
		'lucide:file-code': FileCode
	};

	interface Props {
		icon: string;
		width?: string | number;
		height?: string | number;
		class?: string;
		[key: string]: unknown;
	}

	let { icon, width = '20', height = '20', class: className = '', ...rest }: Props = $props();

	// Get the icon component based on the icon name - Svelte 5 runes syntax
	let IconComponent = $derived(iconMap[icon] || null);
</script>

{#if IconComponent}
	<IconComponent {width} {height} class={className} {...rest} />
{:else}
	<!-- Debug info for missing icons -->
	<span
		class="inline-block {className}"
		style="width: {width}px; height: {height}px;"
		title="Missing icon: {icon}">?</span
	>
{/if}
